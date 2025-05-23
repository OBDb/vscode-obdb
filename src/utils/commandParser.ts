import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Command, CommandPositionResult, Signal } from '../types';

/**
 * Checks if a position in a document is inside a command definition
 * @param document The text document to check
 * @param position The position within the document
 * @returns An object indicating if the position is in a command and command details
 */
export function isPositionInCommand(document: vscode.TextDocument, position: vscode.Position): CommandPositionResult {
  try {
    // Parse the JSON document
    const content = document.getText();
    let jsonDoc;

    try {
      jsonDoc = JSON.parse(content);
    } catch (err) {
      console.error("Error parsing JSON:", err);
      return { isCommand: false };
    }

    // First, check if this document has a commands array
    if (jsonDoc.commands && Array.isArray(jsonDoc.commands)) {
      // We need to determine which command the cursor is in based on position in the file
      // This requires finding the actual text ranges of each command in the file

      // Find all command object start positions (open curly braces)
      const commandStartRegex = /\{\s*"hdr"/g;
      const commandBoundaries: { start: number, end: number, command: Command }[] = [];

      let match;
      let index = 0;

      // Find all potential command start positions
      while ((match = commandStartRegex.exec(content)) !== null) {
        const startPos = match.index;

        // This is the start of a command object
        // Now find its end by tracking braces
        let braceCount = 1;
        let endPos = startPos + 1;

        while (braceCount > 0 && endPos < content.length) {
          if (content[endPos] === '{') braceCount++;
          if (content[endPos] === '}') braceCount--;
          endPos++;
        }

        // If we found a matching command object, store its boundaries
        if (braceCount === 0 && index < jsonDoc.commands.length) {
          commandBoundaries.push({
            start: startPos,
            end: endPos,
            command: jsonDoc.commands[index]
          });
          index++;
        }
      }

      // Now check if our position is within any of these command ranges
      const offset = document.offsetAt(position);

      for (const boundary of commandBoundaries) {
        if (offset >= boundary.start && offset <= boundary.end) {
          // Found the command we're hovering over
          const command = boundary.command;

          // Normalize the command structure for visualization
          const normalizedCommand: Command = { ...command };

          // If command has signals but not parameters, convert signals to parameters
          if (normalizedCommand.signals && !normalizedCommand.parameters) {
            normalizedCommand.parameters = normalizeSignals(normalizedCommand.signals);
          }

          return {
            isCommand: true,
            commandObject: normalizedCommand,
            range: new vscode.Range(
              document.positionAt(boundary.start),
              document.positionAt(boundary.end)
            )
          };
        }
      }
    }

    // Single command case - check if the document itself is a command
    if ((jsonDoc.parameters && Array.isArray(jsonDoc.parameters)) ||
        (jsonDoc.signals && Array.isArray(jsonDoc.signals))) {

      // Normalize command structure to have parameters
      const commandObj: Command = { ...jsonDoc };

      // If the command has signals but not parameters, convert signals to parameters
      if (commandObj.signals && !commandObj.parameters) {
        commandObj.parameters = normalizeSignals(commandObj.signals);
      }

      // This appears to be a command object
      return { isCommand: true, commandObject: commandObj };
    }
  } catch (err) {
    console.error("Error checking if position is in command:", err);
  }

  return { isCommand: false };
}

/**
 * Normalizes signal objects from the command to a standard format
 * @param signals Array of signal objects to normalize
 * @returns Array of normalized signal objects
 */
function normalizeSignals(signals: any[]): Signal[] {
  return signals.map((signal: any) => {
    // Extract bitOffset and bitLength from fmt if available
    const bitOffset = signal.fmt?.bix ?? 0;
    const bitLength = signal.fmt?.len ?? 8;

    return {
      id: signal.id || 'unknown',
      name: signal.name || signal.id || 'Unknown',
      suggestedMetric: signal.suggestedMetric,
      bitOffset,
      bitLength
    };
  });
}

/**
 * Fetches sample responses for a command from test case files
 * @param commandId The command ID to search for (e.g. '7E0.22295A')
 * @returns Array of objects containing model year and sample response data
 */
export async function getSampleCommandResponses(commandId: string): Promise<Array<{modelYear: string, response: string, expectedValues?: Record<string, any>}>> {
  if (!commandId) return [];

  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return [];

    const rootPath = workspaceFolders[0].uri.fsPath;
    const testCasesPath = path.join(rootPath, 'tests', 'test_cases');

    // Check if the test_cases directory exists
    if (!fs.existsSync(testCasesPath)) return [];

    const samples: Array<{modelYear: string, response: string, expectedValues?: Record<string, any>}> = [];
    const modelYearDirs = fs.readdirSync(testCasesPath)
      .filter(dir => /^\d{4}$/.test(dir))  // Only include directories that are 4 digit years
      .sort();  // Sort by year

    // Find command files for this commandId across model years
    for (const yearDir of modelYearDirs) {
      const yearPath = path.join(testCasesPath, yearDir);
      const commandsDir = path.join(yearPath, 'commands');

      if (fs.existsSync(commandsDir)) {
        // Look for a command file with the matching ID
        const [canHeader, cmd] = commandId.split('.');
        const commandFile = path.join(commandsDir, `${commandId}.yaml`);

        if (fs.existsSync(commandFile)) {
          try {
            const content = fs.readFileSync(commandFile, 'utf8');
            const data = yaml.load(content) as any;

            if (data && Array.isArray(data.test_cases) && data.test_cases.length > 0) {
              // Only take the first response from each model year
              const firstCase = data.test_cases[0];
              samples.push({
                modelYear: yearDir,
                response: firstCase.response,
                expectedValues: firstCase.expected_values
              });
            }
          } catch (err) {
            console.error(`Error reading command file ${commandFile}:`, err);
          }
        }
      }
    }

    return samples;
  } catch (error) {
    console.error('Error fetching sample command responses:', error);
    return [];
  }
}

/**
 * Generates a command ID in the format used by command_support.yaml files
 * Takes into account the RAX property when present
 * Format with rax: hdr.rax.cmd (e.g., "7B3.7BB.220100")
 * Format without rax: hdr.cmd (e.g., "7B3.220100")
 *
 * @param header The header value of the command (e.g., "7E0")
 * @param cmd The command value (can be object or string)
 * @param rax Optional RAX value for the command
 * @returns Formatted command ID
 */
export function generateCommandId(header: string, cmd: any, rax?: string): string {
  // Convert cmd to a string representation
  let cmdPart: string;
  if (typeof cmd === 'object') {
    if (Object.keys(cmd).length === 1) {
      const key = Object.keys(cmd)[0];
      const value = cmd[key];
      cmdPart = `${key}${value}`;
    } else {
      cmdPart = JSON.stringify(cmd).replace(/:\s+/g, '');
    }
  } else {
    cmdPart = String(cmd).replace(/:\s+/g, '');
  }

  // Create a full command ID format
  if (rax) {
    // Format with rax: hdr.rax.cmd
    return `${header}.${rax}.${cmdPart}`;
  } else {
    // Original format: hdr.cmd
    return `${header}.${cmdPart}`;
  }
}