import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { generateCommandIdFromDefinition, ID_PROPERTY_DIVIDER } from './commandIdUtils';
import { Generation, getGenerations } from './generations';
import { CommandSupportCache } from '../caches/commands/commandSupportCache';

/**
 * Loads YAML content with ECU keys forced to strings
 */
function loadCommandSupportYaml(content: string): any {
  // Simple regex-based approach to quote ECU keys that look like hex/numeric
  const processedContent = content.replace(
    /^(\s+)([0-9A-Fa-f]{2,3}):\s*$/gm,
    '$1"$2":'
  );

  try {
    return yaml.load(processedContent);
  } catch (error) {
    // Fallback to original content if preprocessing causes issues
    console.warn('Preprocessed YAML failed, falling back to original:', error);
    return yaml.load(content);
  }
}

/**
 * Creates a simple command ID from header, command, and optional receive address
 * @param hdr The header value (e.g. "7E0")
 * @param cmd The command value - can be string or object with single key-value pair
 * @param rax Optional receive address (e.g. "7E8")
 * @returns The command ID string (e.g. "7E0.221100" or "7E0.7E8.221100")
 */
export function createSimpleCommandId(hdr: string, cmd: string | Record<string, string>, rax?: string): string {
  let cmdValueString = '';

  if (typeof cmd === 'object') {
    // Format: {"22": "1100"} -> "221100"
    const cmdKey = Object.keys(cmd)[0];
    const cmdValue = cmd[cmdKey];
    cmdValueString = `${cmdKey}${cmdValue}`;
  } else if (typeof cmd === 'string') {
    // Already a string like "221100"
    cmdValueString = cmd;
  }

  let commandId = `${hdr}.${cmdValueString}`;

  // Include RAX in the format if present
  if (rax) {
    commandId = `${hdr}.${rax}.${cmdValueString}`;
  }

  return commandId;
}

/**
 * Strips the receive filter (middle part) from a command ID if present
 * @param commandId The command ID in format "header.response.command" or "header.command"
 * @returns Simplified command ID in format "header.command"
 */
export function stripReceiveFilter(commandId: string): string {
  const parts = commandId.split('.');
  // If we have 3 parts (header.response.command), take first and last
  if (parts.length === 3) {
    return `${parts[0]}.${parts[2]}`;
  }
  // Otherwise return original
  return commandId;
}

/**
 * Normalizes a command ID by removing any signal information after `:` and `|`.
 * @param commandId The command ID to normalize (e.g. 'DA0E.222612:TLX_GEAR_V2')
 * @returns Normalized command ID without signal information or additional properties
 */
export function normalizeCommandId(commandId: string): string {
  // Remove everything after ':' (signal info)
  return commandId.split(/[:\\|]/)[0];
}

/**
 * Generates a normalized command ID from a command definition object
 * @param command The command object
 * @returns Generated and normalized command ID
 */
export function generateNormalizedCommandId(command: any): string {
  const fullId = generateCommandIdFromDefinition(command);
  return normalizeCommandId(fullId);
}

/**
 * Gets both supported and unsupported model years for a command (cached)
 * @param commandId The command ID to check
 * @param workspaceRoot The workspace folder root path
 * @param cache The cache instance to use
 * @returns Object with supported and unsupported year arrays
 */
export async function getCommandSupportInfo(commandId: string, workspaceRoot: string, cache: CommandSupportCache): Promise<{ supported: string[], unsupported: string[] }> {
  // Check if we have cached results for this command
  const cachedResult = cache.getCommandSupport(workspaceRoot, commandId);
  if (cachedResult) {
    return {
      supported: cachedResult.supported,
      unsupported: cachedResult.unsupported
    };
  }

  // If not cached, fetch both supported and unsupported years
  const [supported, unsupported] = await Promise.all([
    getSupportedModelYearsForCommand(commandId, workspaceRoot, cache),
    getUnsupportedModelYearsForCommand(commandId, workspaceRoot, cache)
  ]);

  // Cache the combined result
  cache.setCommandSupport(workspaceRoot, commandId, supported, unsupported);

  return { supported, unsupported };
}

/**
 * Gets all model years that explicitly list a command as unsupported
 * @param commandId The command ID to check (e.g. '7E0.2211BA')
 * @param workspaceRoot The workspace folder root path
 * @param cache The cache instance to use
 * @returns Array of model years where the command is explicitly unsupported
 */
export async function getUnsupportedModelYearsForCommand(commandId: string, workspaceRoot: string, cache: CommandSupportCache): Promise<string[]> {
  const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');
  const unsupportedYears: string[] = [];

  try {
    const years = await cache.getDirectoryEntries(testCasesPath);
    for (const year of years) {
      const yearPath = path.join(testCasesPath, year);
      try {
        const yearStat = await fs.promises.stat(yearPath);
        if (!yearStat.isDirectory()) {
          continue;
        }

        const supportFilePath = path.join(yearPath, 'command_support.yaml');
        const yamlContent = await cache.getYamlFile(supportFilePath);

        if (yamlContent && yamlContent.unsupported_commands_by_ecu) {
          const unsupportedCommands = Object.values(yamlContent.unsupported_commands_by_ecu as Record<string, string[]>)
            .flat() as string[];

          // Normalize the input command ID
          const normalizedCommandId = normalizeCommandId(commandId);
          const normalizedStripFilter = normalizeCommandId(stripReceiveFilter(commandId));

          // Check if any unsupported command matches when normalized
          const isUnsupported = unsupportedCommands.some(cmd => {
            const normalizedCmd = normalizeCommandId(cmd);
            return normalizedCmd === normalizedCommandId || normalizedCmd === normalizedStripFilter;
          });

          if (isUnsupported) {
            unsupportedYears.push(year);
          }
        }
      } catch (statErr) {
        console.error(`Error stating path for year ${year}:`, statErr);
        // Error stating the year path, skip
      }
    }
  } catch (err) {
    console.error(`Error finding unsupported model years for ${commandId}:`, err);
  }

  return unsupportedYears;
}

/**
 * Gets all model years that support a specific command
 * @param commandId The command ID to check (e.g. '7E0.2211BA')
 * @param workspaceRoot The workspace folder root path
 * @param cache The cache instance to use
 * @returns Array of model years that support the command
 */
export async function getSupportedModelYearsForCommand(commandId: string, workspaceRoot: string, cache: CommandSupportCache): Promise<string[]> {

  const cmdPart = commandId.split('.').pop() || '';
  const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');
  const supportedYears: string[] = [];

  // Extract the header prefix (part before first dot) and suffix (part after last dot) from command ID
  const commandParts = commandId.split('.');
  const commandHeader = commandParts[0]; // e.g., "747"
  const commandSuffix = commandParts[commandParts.length - 1]; // e.g., "220103"

  try {
    const years = await cache.getDirectoryEntries(testCasesPath);
    for (const year of years) {
      const yearPath = path.join(testCasesPath, year);
      try {
        const yearStat = await fs.promises.stat(yearPath);
        if (!yearStat.isDirectory()) {
          continue;
        }

        let foundInYear = false;
        const commandsDir = path.join(yearPath, 'commands');
        try {
          const commandsDirStat = await fs.promises.stat(commandsDir);
          if (commandsDirStat.isDirectory()) {
            const commandFiles = await cache.getDirectoryEntries(commandsDir);
            for (const file of commandFiles) {
              // Parse the filename to extract header and suffix
              const fileNameWithoutExt = normalizeCommandId(file.replace(/\.(yaml|yml)$/, ''));
              const fileParts = fileNameWithoutExt.split('.');
              const fileHeader = fileParts[0]; // e.g., "701" from "701.709.220103"
              const fileSuffix = fileParts[fileParts.length - 1]; // e.g., "220103" from "701.709.220103"

              // Match only if both header and suffix match
              if (fileHeader === commandHeader && fileSuffix === commandSuffix) {
                supportedYears.push(year);
                foundInYear = true;
                break;
              }
            }
          }
        } catch (err) {
          // It's ok if there's no commands directory
        }

        if (!foundInYear) {
          const supportFilePath = path.join(yearPath, 'command_support.yaml');
          const yamlContent = await cache.getYamlFile(supportFilePath);

          if (yamlContent && yamlContent.supported_commands_by_ecu) {
            for (const ecuCommands of Object.values(yamlContent.supported_commands_by_ecu as Record<string, string[]>)) {
              for (const cmd of ecuCommands as string[]) {
                // Use the normalizeCommandId helper to get just the command part
                const normalizedCmd = normalizeCommandId(cmd);
                const ecu = Object.keys(yamlContent.supported_commands_by_ecu).find(key => yamlContent.supported_commands_by_ecu[key] === ecuCommands);

                // Parse the normalized command to extract header and suffix
                const normalizedParts = normalizedCmd.split('.');
                const normalizedHeader = normalizedParts[0];
                const normalizedSuffix = normalizedParts[normalizedParts.length - 1];

                // Check for exact match with proper header and suffix comparison
                const headerMatches = normalizedHeader === commandHeader;
                const suffixMatches = normalizedSuffix === commandSuffix;
                const fullMatch = (ecu && `${ecu}.${normalizedCmd}` === commandId) || normalizedCmd === commandId;

                if ((headerMatches && suffixMatches) || fullMatch) {
                  supportedYears.push(year);
                  foundInYear = true;
                  break;
                }
              }
              if (foundInYear) break;
            }
          }
        }
      } catch (statErr) {
        // Error stating the year path, skip
      }
    }
  } catch (err) {
    console.error(`Error finding supported model years for ${commandId}:`, err);
  }

  return supportedYears;
}

/**
 * Interface for debug filter suggestion
 */
export interface DebugFilter {
  to?: number;
  from?: number;
  years?: number[];
}

/**
 * Generates a debug filter suggestion based on vehicle generation and command support
 * @param supportedYears Array of years the command is known to be supported
 * @param vehicleGeneration The vehicle's generation information
 * @returns Debug filter object or null if no filter is needed
 */
export async function generateDebugFilterSuggestion(
  supportedYears: string[],
  vehicleGeneration: Generation | null
): Promise<DebugFilter | null> {
  if (!vehicleGeneration || supportedYears.length === 0) {
    return null;
  }

  const supportedYearNumbers = supportedYears.map(year => parseInt(year, 10)).filter(year => !isNaN(year));
  if (supportedYearNumbers.length === 0) {
    return null;
  }

  const genStart = vehicleGeneration.start_year;
  const genEnd = vehicleGeneration.end_year || new Date().getFullYear() + 5; // Use current year + 5 if no end year

  // Generate the full range of generation years
  const generationYears: number[] = [];
  for (let year = genStart; year <= genEnd; year++) {
    generationYears.push(year);
  }

  // Find unsupported years within the generation range
  const unsupportedYears = generationYears.filter(year => !supportedYearNumbers.includes(year));

  if (unsupportedYears.length === 0) {
    return null; // No filter needed if all years are supported
  }

  const filter: DebugFilter = {};

  // Check for consecutive ranges at the beginning (to)
  let toYear: number | undefined;
  for (let i = 0; i < unsupportedYears.length; i++) {
    if (unsupportedYears[i] === genStart + i) {
      toYear = unsupportedYears[i];
    } else {
      break;
    }
  }

  // Check for consecutive ranges at the end (from)
  let fromYear: number | undefined;
  for (let i = unsupportedYears.length - 1; i >= 0; i--) {
    const expectedYear = genEnd - (unsupportedYears.length - 1 - i);
    if (unsupportedYears[i] === expectedYear) {
      fromYear = unsupportedYears[i];
    } else {
      break;
    }
  }

  // Individual years that don't fit into ranges
  const individualYears = unsupportedYears.filter(year => {
    const isInToRange = toYear !== undefined && year <= toYear;
    const isInFromRange = fromYear !== undefined && year >= fromYear;
    return !isInToRange && !isInFromRange;
  });

  if (toYear !== undefined) {
    filter.to = toYear;
  }

  if (fromYear !== undefined) {
    filter.from = fromYear;
  }

  if (individualYears.length > 0) {
    filter.years = individualYears;
  }

  // Return null if the filter would be empty
  if (Object.keys(filter).length === 0) {
    return null;
  }

  return filter;
}

/**
 * Optimize an existing debug filter by removing years that are actually supported
 * @param existingFilter The current debug filter
 * @param supportedYears Years that are known to be supported
 * @returns Optimized filter, null if no optimization needed, undefined if filter should be removed entirely
 */
export function optimizeDebugFilter(existingFilter: any, supportedYears: string[]): any | null | undefined {
  if (!existingFilter) {
    return null;
  }

  const supportedYearNumbers = supportedYears.map(y => parseInt(y, 10)).sort((a, b) => a - b);
  let needsOptimization = false;
  const optimized: any = {};

  // Find the range of supported years
  const minSupportedYear = Math.min(...supportedYearNumbers);
  const maxSupportedYear = Math.max(...supportedYearNumbers);

  // Check 'to' property - if a supported year is <= to, we can reduce 'to'
  if (existingFilter.to !== undefined) {
    const supportedYearsAtOrBelowTo = supportedYearNumbers.filter(year => year <= existingFilter.to);
    if (supportedYearsAtOrBelowTo.length > 0) {
      const maxSupportedAtOrBelowTo = Math.max(...supportedYearsAtOrBelowTo);
      // Always reduce 'to' to exclude supported years, don't remove it entirely
      const newTo = maxSupportedAtOrBelowTo - 1;
      if (newTo >= 0) { // Only set if it results in a valid year
        optimized.to = newTo;
        needsOptimization = true;
      } else {
        // If reducing would result in negative year, remove 'to' entirely
        needsOptimization = true;
      }
    } else {
      optimized.to = existingFilter.to;
    }
  }

  // Check 'from' property - if a supported year is >= from, we can increase 'from'
  if (existingFilter.from !== undefined) {
    const supportedYearsAtOrAboveFrom = supportedYearNumbers.filter(year => year >= existingFilter.from);
    if (supportedYearsAtOrAboveFrom.length > 0) {
      const minSupportedAtOrAboveFrom = Math.min(...supportedYearsAtOrAboveFrom);
      // Always increase 'from' to exclude supported years, don't remove it entirely
      const newFrom = minSupportedAtOrAboveFrom + 1;
      if (newFrom <= 3000) { // Only set if it results in a reasonable year
        optimized.from = newFrom;
        needsOptimization = true;
      } else {
        // If increasing would result in unreasonable year, remove 'from' entirely
        needsOptimization = true;
      }
    } else {
      optimized.from = existingFilter.from;
    }
  }

  // Find gaps (unsupported years) between min and max supported years
  const gaps: number[] = [];
  for (let year = minSupportedYear + 1; year < maxSupportedYear; year++) {
    if (!supportedYearNumbers.includes(year)) {
      gaps.push(year);
    }
  }

  // Check 'years' array - remove any years that are supported, and add gaps if they exist
  if (existingFilter.years && Array.isArray(existingFilter.years)) {
    const filteredYears = existingFilter.years.filter((year: number) => !supportedYearNumbers.includes(year));
    if (filteredYears.length < existingFilter.years.length) {
      needsOptimization = true;
      if (filteredYears.length > 0) {
        optimized.years = filteredYears;
      }
    } else {
      optimized.years = existingFilter.years;
    }
  } else if (gaps.length > 0) {
    // Add gaps to the years array if they exist and weren't already there
    optimized.years = gaps;
    needsOptimization = true;
  }

  if (!needsOptimization) {
    return null; // No optimization needed
  }

  // If the optimized filter is empty, suggest removing the filter entirely
  if (Object.keys(optimized).length === 0) {
    return undefined; // Signal to remove the filter
  }

  return optimized;
}

/**
 * Batch loads ALL command support data for a workspace in one pass.
 * This is much faster than calling getCommandSupportInfo() for each command individually.
 *
 * @param workspaceRoot The workspace folder root path
 * @param cache The cache instance to use
 * @returns Map of normalized commandId → { supported: string[], unsupported: string[] }
 */
export async function batchLoadAllCommandSupport(
  workspaceRoot: string,
  cache: CommandSupportCache
): Promise<Map<string, { supported: string[], unsupported: string[] }>> {
  const result = new Map<string, { supported: string[], unsupported: string[] }>();
  const testCasesPath = path.join(workspaceRoot, 'tests', 'test_cases');

  try {
    // Load all years once (O(m) where m = number of years)
    const years = await cache.getDirectoryEntries(testCasesPath);

    for (const year of years) {
      const yearPath = path.join(testCasesPath, year);

      try {
        const yearStat = await fs.promises.stat(yearPath);
        if (!yearStat.isDirectory()) {
          continue;
        }

        // Check command files directory
        const commandsDir = path.join(yearPath, 'commands');
        try {
          const commandsDirStat = await fs.promises.stat(commandsDir);
          if (commandsDirStat.isDirectory()) {
            const commandFiles = await cache.getDirectoryEntries(commandsDir);
            for (const file of commandFiles) {
              // Extract command ID from filename
              const fileNameWithoutExt = normalizeCommandId(file.replace(/\.(yaml|yml)$/, ''));

              // Add to result map
              if (!result.has(fileNameWithoutExt)) {
                result.set(fileNameWithoutExt, { supported: [], unsupported: [] });
              }
              result.get(fileNameWithoutExt)!.supported.push(year);
            }
          }
        } catch (err) {
          // It's ok if there's no commands directory
        }

        // Load command_support.yaml file
        const supportFilePath = path.join(yearPath, 'command_support.yaml');
        const yamlContent = await cache.getYamlFile(supportFilePath);

        if (yamlContent) {
          // Process supported commands
          if (yamlContent.supported_commands_by_ecu) {
            for (const ecuCommands of Object.values(yamlContent.supported_commands_by_ecu as Record<string, string[]>)) {
              for (const cmd of ecuCommands as string[]) {
                const normalizedCmd = normalizeCommandId(cmd);
                const normalizedStripFilter = normalizeCommandId(stripReceiveFilter(cmd));

                // Add both variants to ensure matches
                for (const variant of [normalizedCmd, normalizedStripFilter]) {
                  if (!result.has(variant)) {
                    result.set(variant, { supported: [], unsupported: [] });
                  }
                  if (!result.get(variant)!.supported.includes(year)) {
                    result.get(variant)!.supported.push(year);
                  }
                }
              }
            }
          }

          // Process unsupported commands
          if (yamlContent.unsupported_commands_by_ecu) {
            const unsupportedCommands = Object.values(yamlContent.unsupported_commands_by_ecu as Record<string, string[]>)
              .flat() as string[];

            for (const cmd of unsupportedCommands) {
              const normalizedCmd = normalizeCommandId(cmd);
              const normalizedStripFilter = normalizeCommandId(stripReceiveFilter(cmd));

              // Add both variants
              for (const variant of [normalizedCmd, normalizedStripFilter]) {
                if (!result.has(variant)) {
                  result.set(variant, { supported: [], unsupported: [] });
                }
                if (!result.get(variant)!.unsupported.includes(year)) {
                  result.get(variant)!.unsupported.push(year);
                }
              }
            }
          }
        }
      } catch (statErr) {
        // Skip this year if we can't stat it
        continue;
      }
    }
  } catch (err) {
    console.error('Error batch loading command support:', err);
  }

  return result;
}
