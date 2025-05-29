import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as jsonc from 'jsonc-parser';
import { generateCommandId } from '../utils/commandParser';
import { SignalLinter } from '../linter/signalLinter';
import { SignalLinterCodeActionProvider } from './signalLinterCodeActionProvider';
import { DocumentContext, Signal, SignalGroup } from '../linter/rules/rule';

let diagnosticCollection: vscode.DiagnosticCollection;
const signalLinter = new SignalLinter();
const signalLinterCodeActionProvider = new SignalLinterCodeActionProvider();

/**
 * Creates a diagnostics provider for marking unsupported commands
 * @returns A disposable diagnostics provider registration
 */
export function createDiagnosticsProvider(): vscode.Disposable {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('obdb-commands');

  const disposables: vscode.Disposable[] = [];

  // Register code action provider for JSON files
  disposables.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'json' },
      signalLinterCodeActionProvider
    )
  );

  // Update diagnostics when a document is opened or changed
  disposables.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.languageId === 'json') {
        updateDiagnostics(document);
      }
    })
  );

  disposables.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'json') {
        updateDiagnostics(event.document);
      }
    })
  );

  // Update all open JSON documents on activation
  if (vscode.window.activeTextEditor &&
      vscode.window.activeTextEditor.document.languageId === 'json') {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  // Return a disposable that cleans up resources
  return {
    dispose: () => {
      diagnosticCollection.clear();
      diagnosticCollection.dispose();
      disposables.forEach(d => d.dispose());
    }
  };
}

/**
 * Updates diagnostics for a document
 */
async function updateDiagnostics(document: vscode.TextDocument): Promise<void> {
  // Skip if document is not a JSON file
  if (document.languageId !== 'json') {
    return;
  }

  try {
    const diagnostics: vscode.Diagnostic[] = [];
    const lintResults: any[] = [];

    const text = document.getText();
    const rootNode = jsonc.parseTree(text);

    if (!rootNode) {
      diagnosticCollection.set(document.uri, []);
      signalLinterCodeActionProvider.clearLintResults(document.uri.toString());
      return;
    }

    // Pre-pass: Collect all signal and signal group IDs
    const allIds: Map<string, jsonc.Node> = new Map();
    const documentContext: DocumentContext = { allIds };

    const commandsArrayNode = findNodeAtLocation(rootNode, ["commands"]);
    const signalGroupsArrayNode = findNodeAtLocation(rootNode, ["signalGroups"]);

    // First run document-level linters that process the entire document at once
    try {
      const documentLintResults = signalLinter.lintDocument(rootNode, documentContext);
      lintResults.push(...documentLintResults);
      diagnostics.push(...signalLinter.toDiagnostics(document, documentLintResults));
    } catch (err) {
      console.error('Error running document-level linters:', err);
    }

    // Collect all signal IDs from commands
    if (commandsArrayNode && commandsArrayNode.type === 'array' && commandsArrayNode.children) {
      for (const commandNode of commandsArrayNode.children) {
        const signalsNode = findNodeAtLocation(commandNode, ["signals"]);
        if (signalsNode && signalsNode.type === 'array' && signalsNode.children) {
          for (const signalNode of signalsNode.children) {
            try {
              const signalIdNode = jsonc.findNodeAtLocation(signalNode, ['id']);
              if (signalIdNode) {
                const signalId = jsonc.getNodeValue(signalIdNode);
                if (typeof signalId === 'string' && !allIds.has(signalId)) {
                  allIds.set(signalId, signalNode);
                }
              }
            } catch (err) {
              console.error('Error collecting signal ID from commands:', err);
            }
          }
        }
      }
    }

    // Collect all signal group IDs
    if (signalGroupsArrayNode && signalGroupsArrayNode.type === 'array' && signalGroupsArrayNode.children) {
      for (const signalGroupNode of signalGroupsArrayNode.children) {
        try {
          const groupIdNode = jsonc.findNodeAtLocation(signalGroupNode, ['id']);
          if (groupIdNode) {
            const groupId = jsonc.getNodeValue(groupIdNode);
            if (typeof groupId === 'string' && !allIds.has(groupId)) {
              allIds.set(groupId, signalGroupNode);
            }
          }
        } catch (err) {
          console.error('Error collecting signal group ID:', err);
        }
      }
    }

    // Now that we've collected all IDs, run all command array level linters
    if (commandsArrayNode && commandsArrayNode.type === 'array' && commandsArrayNode.children) {
      try {
        const commandsLintResults = signalLinter.lintCommands(commandsArrayNode, documentContext);
        lintResults.push(...commandsLintResults);
        diagnostics.push(...signalLinter.toDiagnostics(document, commandsLintResults));
      } catch (err) {
        console.error('Error linting commands array:', err);
      }

      // Now process individual commands
      for (const commandNode of commandsArrayNode.children) {
        const hdrNode = findNodeAtLocation(commandNode, ["hdr"]);
        const cmdNode = findNodeAtLocation(commandNode, ["cmd"]);
        const raxNode = findNodeAtLocation(commandNode, ["rax"]);
        const dbgNode = findNodeAtLocation(commandNode, ["dbg"]);
        const signalsNode = findNodeAtLocation(commandNode, ["signals"]);

        // Check for debug commands and add warning
        if (dbgNode && dbgNode.type === 'boolean' && jsonc.getNodeValue(dbgNode) === true) {
          // Get the exact position of the "dbg": true in the document
          if (dbgNode.offset !== undefined && dbgNode.length !== undefined) {
            const startPos = document.positionAt(dbgNode.offset);
            const endPos = document.positionAt(dbgNode.offset + dbgNode.length);

            const diagnostic = new vscode.Diagnostic(
              new vscode.Range(startPos, endPos),
              "This is a debug command, please graduate it once it's confirmed to work",
              vscode.DiagnosticSeverity.Warning
            );
            diagnostic.code = 'obdb-debug-command';
            diagnostics.push(diagnostic);
          }
        }

        // Process command validation
        if (hdrNode && cmdNode && hdrNode.type === 'string') {
          const header = jsonc.getNodeValue(hdrNode);
          const cmd = jsonc.getNodeValue(cmdNode);
          const rax = raxNode ? jsonc.getNodeValue(raxNode) : undefined;

          // Generate the command ID with RAX when available
          const commandId = generateCommandId(header, cmd, rax);

          // Check if command is unsupported
          const isSupportedByAnyYear = await isCommandSupported(commandId);
          const isUnsupportedByAnyYear = await isCommandUnsupported(commandId);

          // Only mark commands that are not supported by any model year
          // and are explicitly marked as unsupported in at least one model year
          if (!isSupportedByAnyYear && isUnsupportedByAnyYear) {
            // Use the exact position of the cmd node in the document
            if (cmdNode.offset !== undefined && cmdNode.length !== undefined) {
              const startPos = document.positionAt(cmdNode.offset);
              const endPos = document.positionAt(cmdNode.offset + cmdNode.length);

              const diagnostic = new vscode.Diagnostic(
                new vscode.Range(startPos, endPos),
                `Command ${commandId} is not supported by any model year`,
                vscode.DiagnosticSeverity.Error
              );
              diagnostic.code = 'obdb-unsupported-command';
              diagnostics.push(diagnostic);
            }
          }
        }

        // Perform command-level linting
        try {
          const command = jsonc.getNodeValue(commandNode);
          // Extract signals from the command
          const signalsInCommand: { signal: Signal, node: jsonc.Node }[] = [];

          if (signalsNode && signalsNode.type === 'array' && signalsNode.children) {
            for (const signalNode of signalsNode.children) {
              try {
                const signal = jsonc.getNodeValue(signalNode) as Signal;
                signalsInCommand.push({ signal, node: signalNode });
              } catch (err) {
                console.error('Error extracting signal for command linting:', err);
              }
            }

            // Process command-level linting
            const commandLintResults = signalLinter.lintCommand(command, commandNode, signalsInCommand, documentContext);
            lintResults.push(...commandLintResults);
            diagnostics.push(...signalLinter.toDiagnostics(document, commandLintResults));
          }
        } catch (err) {
          console.error('Error linting command:', err);
        }

        // Process signals linting within commands
        if (signalsNode && signalsNode.type === 'array' && signalsNode.children) {
          for (const signalNode of signalsNode.children) {
            try {
              const signal = jsonc.getNodeValue(signalNode) as Signal;
              // Pass the documentContext to the linter
              const signalLintResults = signalLinter.lintSignal(signal, signalNode, documentContext);
              lintResults.push(...signalLintResults);
              diagnostics.push(...signalLinter.toDiagnostics(document, signalLintResults));
            } catch (err) {
              console.error('Error linting signal:', err);
            }
          }
        }
      }
    }

    // Process signalGroups linting (primarily for UniqueSignalIdRule)
    if (signalGroupsArrayNode && signalGroupsArrayNode.type === 'array' && signalGroupsArrayNode.children) {
      for (const signalGroupNode of signalGroupsArrayNode.children) {
        try {
          const signalGroup = jsonc.getNodeValue(signalGroupNode) as SignalGroup;
          // Pass the documentContext to the linter
          // Note: Most rules might not apply to SignalGroup, but UniqueSignalIdRule will.
          const groupLintResults = signalLinter.lintSignal(signalGroup, signalGroupNode, documentContext);
          lintResults.push(...groupLintResults);
          diagnostics.push(...signalLinter.toDiagnostics(document, groupLintResults));
        } catch (err) {
          console.error('Error linting signal group:', err);
        }
      }
    }

    // Store the lint results in the code action provider
    signalLinterCodeActionProvider.setLintResults(document.uri.toString(), lintResults);

    // Update diagnostics
    diagnosticCollection.set(document.uri, diagnostics);
  } catch (err) {
    console.error('Error updating diagnostics:', err);
    diagnosticCollection.set(document.uri, []);
    signalLinterCodeActionProvider.clearLintResults(document.uri.toString());
  }
}

/**
 * Find a node at a given path in the JSON tree
 */
function findNodeAtLocation(rootNode: jsonc.Node, path: (string | number)[]): jsonc.Node | undefined {
  return jsonc.findNodeAtLocation(rootNode, path);
}

/**
 * Checks if a command is supported by any model year
 */
async function isCommandSupported(commandId: string): Promise<boolean> {
  // Find all model year directories
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return false;

  const testCasesPath = path.join(workspaceFolders[0].uri.fsPath, 'tests', 'test_cases');

  try {
    // Read test case directories to find model years
    const years = await fs.promises.readdir(testCasesPath);

    // For each year directory
    for (const year of years) {
      // Skip if not a directory
      const yearPath = path.join(testCasesPath, year);
      const yearStat = await fs.promises.stat(yearPath);
      if (!yearStat.isDirectory()) {
        continue;
      }

      // Check for a command-specific test file
      const commandsDir = path.join(yearPath, 'commands');
      try {
        const commandsDirStat = await fs.promises.stat(commandsDir);

        if (commandsDirStat.isDirectory()) {
          const commandFiles = await fs.promises.readdir(commandsDir);
          const commandFileName = `${commandId}.yaml`;

          if (commandFiles.includes(commandFileName)) {
            return true;
          }
        }
      } catch (err) {
        // It's ok if commands directory doesn't exist
      }

      // Check if command is supported in command_support.yaml
      const supportFilePath = path.join(yearPath, 'command_support.yaml');
      try {
        const content = await fs.promises.readFile(supportFilePath, 'utf-8');
        const supportData = yaml.parse(content);

        // Extract the ECU from the command ID
        const ecu = commandId.split('.')[0];
        const cmdPart = commandId.split('.')[1];

        if (supportData && supportData.supported_commands_by_ecu) {
          const ecuCommands = supportData.supported_commands_by_ecu[ecu] || [];

          // Check each supported command for this ECU
          for (const cmd of ecuCommands) {
            // Split the command ID, format in yaml is like "0101:ECT,RPM"
            const cmdParts = cmd.split(':');
            if (cmdParts.length > 0) {
              // Just compare the command part (e.g., "0101")
              if (cmdParts[0] === cmdPart || `${ecu}.${cmdParts[0]}` === commandId) {
                return true;
              }
            }
          }
        }
      } catch (err) {
        // It's ok if the support file doesn't exist
      }
    }
  } catch (err) {
    console.error(`Error checking command support for ${commandId}:`, err);
  }

  return false;
}

/**
 * Checks if a command is explicitly listed as unsupported in any model year
 */
async function isCommandUnsupported(commandId: string): Promise<boolean> {
  // Find all model year directories
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return false;

  const testCasesPath = path.join(workspaceFolders[0].uri.fsPath, 'tests', 'test_cases');

  try {
    // Read test case directories to find model years
    const years = await fs.promises.readdir(testCasesPath);

    // For each year directory
    for (const year of years) {
      // Skip if not a directory
      const yearPath = path.join(testCasesPath, year);
      const yearStat = await fs.promises.stat(yearPath);
      if (!yearStat.isDirectory()) {
        continue;
      }

      // Check if command is unsupported in command_support.yaml
      const supportFilePath = path.join(yearPath, 'command_support.yaml');
      try {
        const content = await fs.promises.readFile(supportFilePath, 'utf-8');
        const supportData = yaml.parse(content);

        if (supportData && supportData.unsupported_commands_by_ecu) {
          for (const ecu of Object.keys(supportData.unsupported_commands_by_ecu)) {
            const commands = supportData.unsupported_commands_by_ecu[ecu] || [];
            if (commands.includes(commandId)) {
              return true;
            }
          }
        }
      } catch (err) {
        // It's ok if the support file doesn't exist
      }
    }
  } catch (err) {
    console.error(`Error checking command unsupport for ${commandId}:`, err);
  }

  return false;
}