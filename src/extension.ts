import * as vscode from 'vscode';
import { createHoverProvider } from './providers/hoverProvider';
import { initializeVisualizationProvider } from './providers/visualizationProvider';
import { createDiagnosticsProvider } from './providers/diagnosticsProvider';
import { createTestProvider } from './providers/testProvider';
import { registerTestCommands, testExecutionEvent } from './utils/testCommands';
import { registerTestExplorer } from './providers/testExplorerProvider';
import { createDefinitionProvider } from './providers/definitionProvider';
import { createCodeLensProvider } from './providers/codeLensProvider';
import { CommandSupportCache } from './caches/commands/commandSupportCache';

// Create a diagnostic collection for test failures
let testDiagnosticCollection: vscode.DiagnosticCollection;

/**
 * Extension activation
 * @param context The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('OBDB extension activated');

  // Create diagnostic collection for test results
  testDiagnosticCollection = vscode.languages.createDiagnosticCollection('obdb-test-failures');

  // Create shared cache instance for command support data
  const commandSupportCache = new CommandSupportCache();

  // Register the hover provider for JSON files
  const hoverProvider = createHoverProvider(commandSupportCache);
  console.log('Registered hover provider for JSON files');

  // Register the visualization provider for bitmap visualizations
  const visualizationProvider = initializeVisualizationProvider();
  console.log('Registered visualization provider for bitmap visualizations');

  // Register the diagnostics provider for command validation
  const diagnosticsProvider = createDiagnosticsProvider(commandSupportCache);
  console.log('Registered diagnostics provider for command validation');

  // Register the test provider for YAML test files
  const testProvider = createTestProvider();
  console.log('Registered test provider for YAML test files');

  // Register the definition provider for command ID navigation in YAML files
  const definitionProvider = createDefinitionProvider();
  console.log('Registered definition provider for command ID navigation');

  // Register the CodeLens provider for JSON command files
  const codeLensProvider = createCodeLensProvider(commandSupportCache);
  console.log('Registered CodeLens provider for JSON command files');

  // Register command for applying debug filters
  const applyDebugFilterCommand = vscode.commands.registerCommand('obdb.applyDebugFilter', async (args: {
    documentUri: string;
    commandRange: vscode.Range;
    debugFilter: any;
  }) => {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.documentUri));
      const editor = await vscode.window.showTextDocument(document);      // Get the command object text
      let commandText = document.getText(args.commandRange);

      // Apply edits to preserve formatting
      let modifiedText = commandText;

      // Remove 'dbg: true' if it exists (with various formatting possibilities)
      // Handle different cases: ", "dbg": true" or ""dbg": true," or just ""dbg": true"
      modifiedText = modifiedText.replace(/,\s*"dbg"\s*:\s*true(?=\s*[,}])/g, '');
      modifiedText = modifiedText.replace(/"dbg"\s*:\s*true\s*,/g, '');

      // Format the debug filter with spaces around braces to match style
      const formatDebugFilter = (filter: any): string => {
        const parts: string[] = [];
        if (filter.to !== undefined) parts.push(`"to": ${filter.to}`);
        if (filter.years !== undefined) parts.push(`"years": [${filter.years.join(', ')}]`);
        if (filter.from !== undefined) parts.push(`"from": ${filter.from}`);
        return `{ ${parts.join(', ')} }`;
      };

      const debugFilterJson = formatDebugFilter(args.debugFilter);

      // Find where to insert the dbgfilter - after command properties but before signals
      // Look for the "signals" property and insert before it
      const signalsMatch = modifiedText.match(/,\s*"signals"\s*:/);

      if (signalsMatch && signalsMatch.index !== undefined) {
        // Insert before the "signals" property
        const insertPosition = signalsMatch.index;
        const beforeSignals = modifiedText.substring(0, insertPosition);
        const fromSignals = modifiedText.substring(insertPosition);

        modifiedText = beforeSignals + `, "dbgfilter": ${debugFilterJson}` + fromSignals;
      } else {
        // Fallback: insert before the closing brace if no signals found
        const closingBraceIndex = modifiedText.lastIndexOf('}');
        if (closingBraceIndex === -1) {
          vscode.window.showErrorMessage('Could not find closing brace in command object');
          return;
        }

        // Check if there's already content before the closing brace
        const beforeClosingBrace = modifiedText.substring(0, closingBraceIndex).trim();
        const needsComma = beforeClosingBrace.endsWith('"') || beforeClosingBrace.endsWith('}') || beforeClosingBrace.endsWith(']');

        // Format the debug filter with proper comma
        const formattedDebugFilter = `${needsComma ? ', ' : ''}"dbgfilter": ${debugFilterJson}`;

        // Insert the debug filter
        const beforeBrace = modifiedText.substring(0, closingBraceIndex);
        const afterBrace = modifiedText.substring(closingBraceIndex);
        modifiedText = beforeBrace + formattedDebugFilter + afterBrace;
      }

      // Replace the command in the document
      await editor.edit(editBuilder => {
        editBuilder.replace(args.commandRange, modifiedText);
      });

      vscode.window.showInformationMessage('Debug filter applied successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to apply debug filter: ${error}`);
    }
  });

  // Register command for optimizing debug filters
  const optimizeDebugFilterCommand = vscode.commands.registerCommand('obdb.optimizeDebugFilter', async (args: {
    documentUri: string;
    commandRange: vscode.Range;
    optimizedFilter: any;
  }) => {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.documentUri));
      const editor = await vscode.window.showTextDocument(document);

      // Get the command object text
      let commandText = document.getText(args.commandRange);

      // Check if filter should be removed (undefined, null, or empty object)
      const shouldRemoveFilter = args.optimizedFilter === undefined ||
                                  args.optimizedFilter === null ||
                                  (typeof args.optimizedFilter === 'object' && Object.keys(args.optimizedFilter).length === 0);

      if (shouldRemoveFilter) {
        // Remove the debug filter entirely
        let modifiedText = commandText;

        // Remove 'dbgfilter' property with various formatting possibilities
        modifiedText = modifiedText.replace(/,\s*"dbgfilter"\s*:\s*\{[^}]*\}(?=\s*[,}])/g, '');
        modifiedText = modifiedText.replace(/"dbgfilter"\s*:\s*\{[^}]*\}\s*,/g, '');

        await editor.edit(editBuilder => {
          editBuilder.replace(args.commandRange, modifiedText);
        });

        vscode.window.showInformationMessage('Debug filter removed - all years are supported');
      } else {
        // Update the debug filter with optimized version
        let modifiedText = commandText;

        // Format the optimized filter with spaces around braces to match style
        const formatDebugFilter = (filter: any): string => {
          const parts: string[] = [];
          if (filter.to !== undefined) parts.push(`"to": ${filter.to}`);
          if (filter.years !== undefined) parts.push(`"years": [${filter.years.join(', ')}]`);
          if (filter.from !== undefined) parts.push(`"from": ${filter.from}`);
          return `{ ${parts.join(', ')} }`;
        };

        const optimizedFilterJson = formatDebugFilter(args.optimizedFilter);

        // Replace the existing dbgfilter
        modifiedText = modifiedText.replace(/"dbgfilter"\s*:\s*\{[^}]*\}/g, `"dbgfilter": ${optimizedFilterJson}`);

        await editor.edit(editBuilder => {
          editBuilder.replace(args.commandRange, modifiedText);
        });

        vscode.window.showInformationMessage('Debug filter optimized - removed supported years');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to optimize debug filter: ${error}`);
    }
  });

  // Register command for adding rax filter
  const addRaxFilterCommand = vscode.commands.registerCommand('obdb.addRaxFilter', async (args: {
    documentUri: string;
    commandRange: vscode.Range;
    suggestedRax: string;
  }) => {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.documentUri));
      const editor = await vscode.window.showTextDocument(document);

      // Get the command object text
      let commandText = document.getText(args.commandRange);

      // Find the hdr property and insert rax immediately after it
      const hdrMatch = commandText.match(/"hdr"\s*:\s*"[^"]*"/);

      if (hdrMatch && hdrMatch.index !== undefined) {
        const insertPosition = hdrMatch.index + hdrMatch[0].length;
        const beforeInsert = commandText.substring(0, insertPosition);
        const afterInsert = commandText.substring(insertPosition);

        const modifiedText = beforeInsert + `, "rax": "${args.suggestedRax}"` + afterInsert;

        await editor.edit(editBuilder => {
          editBuilder.replace(args.commandRange, modifiedText);
        });

        vscode.window.showInformationMessage(`Rax filter "${args.suggestedRax}" added successfully`);
      } else {
        vscode.window.showErrorMessage('Could not find hdr property to insert rax filter after');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add rax filter: ${error}`);
    }
  });

  // Register test commands for running and debugging tests
  const testCommands = registerTestCommands(context);
  console.log('Registered commands for running and debugging tests');

  // Register test explorer integration
  const testExplorer = registerTestExplorer(context);
  console.log('Registered test explorer integration');

  // Subscribe to test execution events to update diagnostics
  const testExecutionSubscription = testExecutionEvent.event(event => {
    handleTestExecutionResult(event);
  });

  // Automatically show bitmap visualization when editing a JSON file
  const autoShowDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor && editor.document.languageId === 'json') {
      // Delay slightly to ensure document is fully loaded
      setTimeout(() => {
        vscode.commands.executeCommand('obdb.showBitmapVisualization');
      }, 300);
    }
  });

  // Initial auto-show if starting with a JSON file open
  if (vscode.window.activeTextEditor &&
      vscode.window.activeTextEditor.document.languageId === 'json') {
    setTimeout(() => {
      vscode.commands.executeCommand('obdb.showBitmapVisualization');
    }, 500);
  }

  // Add providers and other disposables to subscriptions
  context.subscriptions.push(
    hoverProvider,
    visualizationProvider,
    diagnosticsProvider,
    testProvider,
    ...definitionProvider,
    codeLensProvider, // Added provider to subscriptions
    applyDebugFilterCommand,
    optimizeDebugFilterCommand,
    addRaxFilterCommand,
    ...testCommands,
    testExplorer,
    testExecutionSubscription,
    autoShowDisposable,
    testDiagnosticCollection
  );
}

/**
 * Handle test execution results to update diagnostics
 * @param event The test execution event
 */
async function handleTestExecutionResult(event: {
  uri: vscode.Uri;
  success: boolean;
  testIndex?: number;
  isDebug: boolean;
  errorMessage?: string;
  errorLocation?: { file: string; line: number };
}) {
  try {
    // Clear existing diagnostics for this URI
    testDiagnosticCollection.delete(event.uri);

    // If test succeeded, we're done - no diagnostics needed
    if (event.success) {
      return;
    }

    // If there's no error message, skip
    if (!event.errorMessage) {
      return;
    }

    // If there's a specific error location, show the error there
    if (event.errorLocation) {
      const errorFilePath = event.errorLocation.file;
      const errorLine = event.errorLocation.line;

      try {
        // Create a URI for the error location file
        const errorFileUri = vscode.Uri.file(errorFilePath);

        // Try to open the document to get position information
        const errorDocument = await vscode.workspace.openTextDocument(errorFileUri);

        // Create a range for the specific line
        const lineStart = new vscode.Position(errorLine, 0);
        const lineEnd = new vscode.Position(errorLine, 1000); // Use a large column number to get to end of line
        const range = new vscode.Range(lineStart, lineEnd);

        // Create a diagnostic at the exact line of the error
        const diagnostic = new vscode.Diagnostic(
          range,
          event.errorMessage,
          vscode.DiagnosticSeverity.Error
        );

        // Set the diagnostic on the error file
        testDiagnosticCollection.set(errorFileUri, [diagnostic]);

        // Open the document at the error location
        vscode.window.showTextDocument(errorFileUri, {
          selection: range,
          preserveFocus: false
        });
      } catch (err) {
        console.error("Error creating diagnostic at specific location:", err);
        // Fall back to showing the error at the original test file
        showErrorInOriginalFile(event);
      }
    } else {
      // No specific location, show in the original file
      showErrorInOriginalFile(event);
    }
  } catch (err) {
    console.error("Error handling test results:", err);
  }
}

/**
 * Show an error in the original test file when we can't show it at the specific location
 */
function showErrorInOriginalFile(event: {
  uri: vscode.Uri;
  success: boolean;
  testIndex?: number;
  isDebug: boolean;
  errorMessage?: string;
}) {
  if (!event.errorMessage) return;

  // Create a diagnostic at the top of the file
  const range = new vscode.Range(0, 0, 0, 0);
  const diagnostic = new vscode.Diagnostic(
    range,
    event.errorMessage,
    vscode.DiagnosticSeverity.Error
  );

  // Set the diagnostic on the original file
  testDiagnosticCollection.set(event.uri, [diagnostic]);
}

/**
 * Extension deactivation
 */
export function deactivate() {
  // Clear the diagnostic collection
  if (testDiagnosticCollection) {
    testDiagnosticCollection.clear();
    testDiagnosticCollection.dispose();
  }
}