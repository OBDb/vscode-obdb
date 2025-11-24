import { CommandSupportCache } from '../caches/commands/commandSupportCache';
import {
  getCommandSupportInfo,
  batchLoadAllCommandSupport,
  normalizeCommandId
} from '../utils/commandSupportUtils';

export interface CommandSupportResult {
  commandId: string;
  supported: string[];
  unsupported: string[];
  allYears: string[];
  supportPercentage: number;
}

/**
 * Gets support information for a specific command
 * @param commandId The command ID to query
 * @param workspaceRoot Workspace root path
 * @param cache Command support cache instance
 * @returns Support information
 */
export async function getSupport(
  commandId: string,
  workspaceRoot: string,
  cache: CommandSupportCache
): Promise<CommandSupportResult> {
  const normalized = normalizeCommandId(commandId);
  const { supported, unsupported } = await getCommandSupportInfo(normalized, workspaceRoot, cache);

  const allYears = [...new Set([...supported, ...unsupported])].sort();
  const supportPercentage = allYears.length > 0
    ? (supported.length / allYears.length) * 100
    : 0;

  return {
    commandId: normalized,
    supported: supported.sort(),
    unsupported: unsupported.sort(),
    allYears,
    supportPercentage: Math.round(supportPercentage * 10) / 10
  };
}

/**
 * Gets support information for multiple commands in batch
 * @param commandIds Array of command IDs
 * @param workspaceRoot Workspace root path
 * @param cache Command support cache instance
 * @returns Map of command ID to support info
 */
export async function getBatchSupport(
  commandIds: string[],
  workspaceRoot: string,
  cache: CommandSupportCache
): Promise<Map<string, CommandSupportResult>> {
  const results = new Map<string, CommandSupportResult>();

  // Use batch loading for efficiency
  const allSupport = await batchLoadAllCommandSupport(workspaceRoot, cache);

  for (const commandId of commandIds) {
    const normalized = normalizeCommandId(commandId);
    const supportData = allSupport.get(normalized);

    if (supportData) {
      const allYears = [...new Set([...supportData.supported, ...supportData.unsupported])].sort();
      const supportPercentage = allYears.length > 0
        ? (supportData.supported.length / allYears.length) * 100
        : 0;

      results.set(commandId, {
        commandId: normalized,
        supported: supportData.supported.sort(),
        unsupported: supportData.unsupported.sort(),
        allYears,
        supportPercentage: Math.round(supportPercentage * 10) / 10
      });
    } else {
      results.set(commandId, {
        commandId: normalized,
        supported: [],
        unsupported: [],
        allYears: [],
        supportPercentage: 0
      });
    }
  }

  return results;
}

/**
 * Gets all commands supported in a specific model year
 * @param year The model year
 * @param workspaceRoot Workspace root path
 * @param cache Command support cache instance
 * @returns Array of command IDs supported in that year
 */
export async function getCommandsForYear(
  year: string,
  workspaceRoot: string,
  cache: CommandSupportCache
): Promise<string[]> {
  const allSupport = await batchLoadAllCommandSupport(workspaceRoot, cache);
  const commands: string[] = [];

  for (const [commandId, support] of allSupport.entries()) {
    if (support.supported.includes(year)) {
      commands.push(commandId);
    }
  }

  return commands.sort();
}

/**
 * Gets a support matrix for all commands
 * @param workspaceRoot Workspace root path
 * @param cache Command support cache instance
 * @returns Array of command support results
 */
export async function getSupportMatrix(
  workspaceRoot: string,
  cache: CommandSupportCache
): Promise<CommandSupportResult[]> {
  const allSupport = await batchLoadAllCommandSupport(workspaceRoot, cache);
  const results: CommandSupportResult[] = [];

  for (const [commandId, support] of allSupport.entries()) {
    const allYears = [...new Set([...support.supported, ...support.unsupported])].sort();
    const supportPercentage = allYears.length > 0
      ? (support.supported.length / allYears.length) * 100
      : 0;

    results.push({
      commandId,
      supported: support.supported.sort(),
      unsupported: support.unsupported.sort(),
      allYears,
      supportPercentage: Math.round(supportPercentage * 10) / 10
    });
  }

  return results.sort((a, b) => a.commandId.localeCompare(b.commandId));
}

/**
 * Formats support information as a human-readable string
 * @param support The support result
 * @returns Formatted string
 */
export function formatSupportInfo(support: CommandSupportResult): string {
  const lines: string[] = [
    `Command: ${support.commandId}`,
    `Support: ${support.supportPercentage}% (${support.supported.length}/${support.allYears.length} years)`
  ];

  if (support.supported.length > 0) {
    lines.push(`Supported years: ${formatYearList(support.supported)}`);
  }

  if (support.unsupported.length > 0) {
    lines.push(`Unsupported years: ${formatYearList(support.unsupported)}`);
  }

  return lines.join('\n');
}

/**
 * Formats an array of years into a compact range string
 * @param years Array of year strings
 * @returns Formatted string (e.g., "2015-2018, 2020, 2022-2024")
 */
function formatYearList(years: string[]): string {
  const yearNumbers = years.map(y => parseInt(y, 10)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let rangeStart = yearNumbers[0];
  let rangeEnd = yearNumbers[0];

  for (let i = 1; i <= yearNumbers.length; i++) {
    if (i < yearNumbers.length && yearNumbers[i] === rangeEnd + 1) {
      rangeEnd = yearNumbers[i];
    } else {
      if (rangeStart === rangeEnd) {
        ranges.push(rangeStart.toString());
      } else if (rangeEnd === rangeStart + 1) {
        ranges.push(`${rangeStart}, ${rangeEnd}`);
      } else {
        ranges.push(`${rangeStart}-${rangeEnd}`);
      }

      if (i < yearNumbers.length) {
        rangeStart = yearNumbers[i];
        rangeEnd = yearNumbers[i];
      }
    }
  }

  return ranges.join(', ');
}
