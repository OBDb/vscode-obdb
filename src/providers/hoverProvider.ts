import * as vscode from 'vscode';
import { isPositionInCommand } from '../utils/commandParser';
import { getModelYearsForSignalId } from '../utils/modelYears';
import { generateBitMappingVisualization } from '../visualization/bitMapping';
import { getCachedImage, cacheImage } from '../utils/cache';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { groupModelYearsByGeneration } from '../utils/generations';
import { numberToExcelColumn, bixToByte } from '../utils/bixConverter';
import { getSupportedModelYearsForCommand, getUnsupportedModelYearsForCommand, stripReceiveFilter, createSimpleCommandId } from '../utils/commandSupportUtils';
import { CommandSupportCache } from '../caches/commands/commandSupportCache';
import { PerformanceMonitor } from '../utils/performanceMonitor';

/**
 * Creates a hover provider for JSON files
 * @param cache The cache instance to use for command support lookups
 * @returns A disposable hover provider registration
 */
export function createHoverProvider(cache: CommandSupportCache): vscode.Disposable {
  return vscode.languages.registerHoverProvider('json', {
    async provideHover(document, position, token) {
      const opId = `hover-${Date.now()}-${Math.random()}`;
      PerformanceMonitor.startTimer(opId, 'HoverProvider.provideHover', {
        fileName: document.fileName,
        line: position.line,
        char: position.character
      });

      try {
        // Check if we're in a JSON file that's in the signalsets directory
        if (!document.fileName.includes('signalsets') && !document.fileName.includes('commands')) {
          PerformanceMonitor.endTimer(opId, 'HoverProvider.provideHover', { result: 'not-applicable' });
          return undefined;
        }

      // Create the hovercard content
      const markdownContent = new vscode.MarkdownString();

      // CASE 1: Check for signal ID hover
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
      if (wordRange) {
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;
        const idRegex = /"id"\s*:\s*"([A-Za-z0-9_]+)"/;
        const match = idRegex.exec(lineText);

        // If we found a signal ID match, get its supported model years
        if (match && match[1] === word) {
          // Get the workspace root
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceRoot) {
            return undefined;
          }

          // Get supported model years for this signal ID
          const modelYears = await getModelYearsForSignalId(word, workspaceRoot);

          if (modelYears.length > 0) {
            // Add the signal ID title
            markdownContent.appendMarkdown(`## ${word}\n\n`);

            // Group model years by generation
            const groupedYears = await groupModelYearsByGeneration(modelYears);

            // Display years grouped by generation
            markdownContent.appendMarkdown(`### Supported Model Years\n\n`);

            for (const [generationName, years] of Object.entries(groupedYears)) {
              // Sort years numerically within each generation
              years.sort((a, b) => parseInt(a) - parseInt(b));

              markdownContent.appendMarkdown(`- **${generationName}:** ${years.join(', ')}\n\n`);
            }
          } else {
            // Add the signal ID title even if no model years are found
            markdownContent.appendMarkdown(`## ${word}\n\n`);
            markdownContent.appendMarkdown(`No model year support information available.\n\n`);
          }

          // Return the hover for signal ID
          PerformanceMonitor.endTimer(opId, 'HoverProvider.provideHover', { result: 'signal-id', signalId: word });
          return new vscode.Hover(markdownContent);
        }
      }

      // CASE 2: Check for signal group hover
      // We're looking for a pattern like: {"id": "SIGNAL_GROUP_ID", ..., "matchingRegex": "REGEX_PATTERN", ...}
      if (wordRange) {
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;

        // Check if this is a line with a signal group definition
        const signalGroupIdRegex = /"id"\s*:\s*"([A-Za-z0-9_]+)"/;
        const matchingRegexPropRegex = /"matchingRegex"\s*:\s*"([^"]+)"/;

        const signalGroupMatch = signalGroupIdRegex.exec(lineText);
        const matchingRegexMatch = matchingRegexPropRegex.exec(lineText);

        // If we have both an ID and a matchingRegex in the same line, it's a signal group
        if (signalGroupMatch && matchingRegexMatch) {
          const signalGroupId = signalGroupMatch[1];
          const matchingRegexPattern = matchingRegexMatch[1];

          // Find all signals in the file that match this regex
          const matchingSignals = await countMatchingSignals(document, matchingRegexPattern);

          // Create the hover content
          markdownContent.appendMarkdown(`## Signal Group: \`${signalGroupId}\`\n\n`);
          markdownContent.appendMarkdown(`Matching Pattern: \`${matchingRegexPattern}\`\n\n`);
          markdownContent.appendMarkdown(`**${matchingSignals.length} matching signals found in this file**\n\n`);

          // If we have matching signals, list the first few
          if (matchingSignals.length > 0) {
            markdownContent.appendMarkdown(`### Matching Signals (showing first ${Math.min(10, matchingSignals.length)})\n\n`);
            matchingSignals.slice(0, 10).forEach(signal => {
              markdownContent.appendMarkdown(`- \`${signal}\`\n`);
            });

            // If there are more than 10 matches, indicate it
            if (matchingSignals.length > 10) {
              markdownContent.appendMarkdown(`\n... and ${matchingSignals.length - 10} more\n`);
            }
          }

          PerformanceMonitor.endTimer(opId, 'HoverProvider.provideHover', {
            result: 'signal-group',
            groupId: signalGroupId,
            matchCount: matchingSignals.length
          });
          return new vscode.Hover(markdownContent);
        }
      }

      // CASE 3: Check for bix values in signal format definitions
      // Example: {"id": "SIGNAL_ID", "fmt": {"bix": 264, ...}, ...}
      if (wordRange) {
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;

        // Check if we're hovering on a bix value
        const bixRegex = /"bix"\s*:\s*(\d+)/;
        const bixMatch = bixRegex.exec(lineText);

        if (bixMatch && word === bixMatch[1]) {
          // Get the bix value
          const bixValue = parseInt(word);

          // Calculate alphabetical equivalent (A-Z, AA-ZZ, etc.)
          const alphaEquivalent = numberToExcelColumn(bixValue);

          // Calculate byte value (bix / 8)
          const byteValue = bixToByte(bixValue);

          // Create hover content
          markdownContent.appendMarkdown(`**Byte**: \`${byteValue}\` / \`${alphaEquivalent}\``);

          PerformanceMonitor.endTimer(opId, 'HoverProvider.provideHover', {
            result: 'bix-value',
            bixValue,
            byteValue
          });
          return new vscode.Hover(markdownContent);
        }
      }

      // CASE 4: Check for command definition hover
      // First check if we're in a command object by examining the surrounding context
      const positionResult = isPositionInCommand(document, position);
      if (positionResult.isCommand) {
        // Check if we're hovering over the "cmd" property
        const lineText = document.lineAt(position.line).text;

        // Look for cmd patterns like "cmd": {"22": "2610"} or "cmd": "221100"
        const cmdObjectRegex = /"cmd"\s*:\s*(\{[^}]*\}|\d+)/;
        const cmdMatch = cmdObjectRegex.exec(lineText);

        if (cmdMatch) {
          // We're hovering over a cmd definition
          // Generate command ID from the command object
          let commandId = '';

          if (positionResult.commandObject) {
            const hdr = positionResult.commandObject.hdr;
            const cmd = positionResult.commandObject.cmd;
            const rax = positionResult.commandObject.rax;

            // Try to extract a command ID
            if (hdr && cmd) {
              commandId = createSimpleCommandId(hdr, cmd, rax);
            }
          }

          if (commandId) {
            // Get the workspace root
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              return undefined;
            }

            // First display command ID
            markdownContent.appendMarkdown(`## Command: \`${commandId}\`\n\n`);

            // Get unsupported model years for this command
            const unsupportedYears = await getUnsupportedModelYearsForCommand(commandId, workspaceRoot, cache);

            // Get supported model years for this command
            const supportedYears = await getSupportedModelYearsForCommand(commandId, workspaceRoot, cache);

            // Create a combined table of all years with support status
            const allYears = [...new Set([...supportedYears, ...unsupportedYears])];

            if (allYears.length > 0) {
              // Group all years by generation
              const allYearsByGeneration = await groupModelYearsByGeneration(allYears);

              markdownContent.appendMarkdown('```\n');

              // Display years grouped by generation in descending order
              const sortedGenerations = Object.entries(allYearsByGeneration).sort((a, b) => {
                // Extract generation numbers for sorting
                const genNumA = parseInt(a[1][0]);
                const genNumB = parseInt(b[1][0]);
                return genNumB - genNumA; // Descending order
              });

              // Display years grouped by generation
              for (const [generationName, yearsInGeneration] of sortedGenerations) {
                // Find min and max years in this generation
                const minYear = Math.min(...yearsInGeneration.map(y => parseInt(y)));
                const maxYear = Math.max(...yearsInGeneration.map(y => parseInt(y)));

                // Add generation header
                markdownContent.appendMarkdown(`- ${generationName.padEnd(8)}\n`);

                // Generate every year in the range, including gaps
                for (let yearNum = maxYear; yearNum >= minYear; yearNum--) {
                  const year = yearNum.toString();
                  const isSupported = supportedYears.includes(year);
                  const isUnsupported = unsupportedYears.includes(year);

                  let statusEmoji = "?"; // Unknown status

                  if (isSupported) {
                    statusEmoji = "✅";
                  } else if (isUnsupported) {
                    statusEmoji = "❌";
                  }

                  markdownContent.appendMarkdown(`| ${year.padEnd(4)} | ${statusEmoji} |\n`);
                }
              }
            } else {
              markdownContent.appendMarkdown(`### Model Year Support\n\nNo support information available.\n\n`);
            }

            PerformanceMonitor.endTimer(opId, 'HoverProvider.provideHover', {
              result: 'command-definition',
              commandId,
              supportedCount: supportedYears.length,
              unsupportedCount: unsupportedYears.length
            });
            return new vscode.Hover(markdownContent);
          }
        }
      }

      PerformanceMonitor.endTimer(opId, 'HoverProvider.provideHover', { result: 'no-match' });
      return undefined;
      } catch (error) {
        PerformanceMonitor.endTimer(opId, 'HoverProvider.provideHover', {
          result: 'error',
          error: String(error)
        });
        throw error;
      }
    }
  });
}

/**
 * Counts all signals in the document that match a given regex pattern
 * @param document The document to search
 * @param regexPattern The regex pattern to match
 * @returns Array of matching signal IDs
 */
async function countMatchingSignals(document: vscode.TextDocument, regexPattern: string): Promise<string[]> {
  const matchingSignals: string[] = [];
  const regex = new RegExp(regexPattern.replace(/\\\\/g, "\\"));

  // Parse the entire document content to find signal definitions
  const text = document.getText();
  let jsonContent;

  try {
    jsonContent = JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse JSON document:", error);
    return matchingSignals;
  }

  // Check if we have a commands array with signals
  if (jsonContent && jsonContent.commands) {
    // Iterate through each command
    for (const command of jsonContent.commands) {
      // Check if the command has signals
      if (command.signals && Array.isArray(command.signals)) {
        // Check each signal ID against the regex
        for (const signal of command.signals) {
          if (signal.id && regex.test(signal.id)) {
            matchingSignals.push(signal.id);
          }
        }
      }
    }
  }

  return matchingSignals;
}