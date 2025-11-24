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
  const visualizationProvider = initializeVisualizationProvider(context);
  console.log('Registered visualization provider for bitmap visualizations in sidebar');

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

  // Register command for optimizing filter
  const optimizeFilterCommand = vscode.commands.registerCommand('obdb.optimizeFilter', async (args: {
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
        // Remove the filter entirely
        let modifiedText = commandText;

        // Remove 'filter' property with various formatting possibilities
        modifiedText = modifiedText.replace(/,\s*"filter"\s*:\s*\{[^}]*\}(?=\s*[,}])/g, '');
        modifiedText = modifiedText.replace(/"filter"\s*:\s*\{[^}]*\}\s*,/g, '');

        await editor.edit(editBuilder => {
          editBuilder.replace(args.commandRange, modifiedText);
        });

        vscode.window.showInformationMessage('Filter removed - all years supported or uncertain');
      } else {
        // Format the optimized filter
        const formatFilter = (filter: any): string => {
          const parts: string[] = [];
          if (filter.to !== undefined) parts.push(`"to": ${filter.to}`);
          if (filter.years !== undefined) parts.push(`"years": [${filter.years.join(', ')}]`);
          if (filter.from !== undefined) parts.push(`"from": ${filter.from}`);
          return `{ ${parts.join(', ')} }`;
        };

        const optimizedFilterJson = formatFilter(args.optimizedFilter);

        let modifiedText = commandText;

        // Check if filter property already exists
        if (/"filter"\s*:\s*\{[^}]*\}/.test(modifiedText)) {
          // Replace existing filter
          modifiedText = modifiedText.replace(/"filter"\s*:\s*\{[^}]*\}/g, `"filter": ${optimizedFilterJson}`);
        } else {
          // Add new filter property after freq
          const freqMatch = modifiedText.match(/"freq"\s*:\s*[^,}]+/);
          if (freqMatch && freqMatch.index !== undefined) {
            const insertPosition = freqMatch.index + freqMatch[0].length;
            const beforeInsert = modifiedText.substring(0, insertPosition);
            const afterInsert = modifiedText.substring(insertPosition);
            modifiedText = beforeInsert + `, "filter": ${optimizedFilterJson}` + afterInsert;
          }
        }

        await editor.edit(editBuilder => {
          editBuilder.replace(args.commandRange, modifiedText);
        });

        vscode.window.showInformationMessage('Filter optimized');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to optimize filter: ${error}`);
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

  // Register command for bulk optimizing all debug filters in the current document
  const optimizeAllDebugFiltersCommand = vscode.commands.registerCommand('obdb.optimizeAllDebugFilters', async () => {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      const document = editor.document;

      // Check if this is a valid document
      if (!document.fileName.includes('signalsets') && !document.fileName.includes('commands')) {
        vscode.window.showErrorMessage('This command only works on signalsets or commands JSON files');
        return;
      }

      // Import jsonc-parser
      const jsonc = require('jsonc-parser');
      const text = document.getText();
      const rootNode = jsonc.parseTree(text);

      if (!rootNode || rootNode.type !== 'object') {
        vscode.window.showErrorMessage('Invalid JSON structure');
        return;
      }

      const commandsProperty = jsonc.findNodeAtLocation(rootNode, ['commands']);
      if (!commandsProperty || commandsProperty.type !== 'array' || !commandsProperty.children) {
        vscode.window.showErrorMessage('No commands array found in document');
        return;
      }

      // Collect all optimization operations
      const optimizations: Array<{
        range: vscode.Range;
        optimizedFilter: any;
        isNew: boolean;
      }> = [];

      // Import necessary utilities
      const { getGenerations } = require('./utils/generations');
      const { GenerationSet } = require('./utils/generationsCore');
      const { calculateDebugFilter } = require('./utils/debugFilterCalculator');
      const { createSimpleCommandId, normalizeCommandId, stripReceiveFilter } = require('./utils/commandSupportUtils');
      const { batchLoadAllCommandSupport } = require('./utils/commandSupportUtils');

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
      }

      console.log('Workspace root:', workspaceRoot);

      // Load batch support data
      let batchSupportData = commandSupportCache.getBatchCommandSupport(workspaceRoot);
      console.log('Cached batch support data size:', batchSupportData?.size || 0);
      if (batchSupportData && batchSupportData.size > 0) {
        // Log first few keys
        const keys = Array.from(batchSupportData.keys()).slice(0, 5);
        console.log('Sample command IDs in batch data:', keys);
      }

      if (!batchSupportData) {
        console.log('Loading batch support data from disk...');
        batchSupportData = await batchLoadAllCommandSupport(workspaceRoot, commandSupportCache);
        console.log('Loaded batch support data size:', batchSupportData?.size || 0);
        if (batchSupportData) {
          commandSupportCache.setBatchCommandSupport(workspaceRoot, batchSupportData);
        }
      }

      if (!batchSupportData || batchSupportData.size === 0) {
        vscode.window.showErrorMessage('Failed to load command support data or no commands found');
        return;
      }

      const generations = await getGenerations(workspaceRoot);
      if (!generations || generations.length === 0) {
        vscode.window.showErrorMessage('No generation data found');
        return;
      }

      const generationSet = new GenerationSet(generations);

      // Scan all commands for optimization opportunities
      let totalCommands = 0;
      let commandsWithDebug = 0;
      let commandsWithSupportedYears = 0;
      for (const commandNode of commandsProperty.children) {
        if (commandNode.type === 'object' && commandNode.children) {
          totalCommands++;
          let hdr: string | undefined;
          let cmdProperty: any;
          let rax: string | undefined;
          let hasDebug = false;
          let existingDbgFilter: any = null;
          let commandFilter: any = null;

          for (const prop of commandNode.children) {
            if (prop.type === 'property' && prop.children && prop.children.length === 2) {
              const keyNode = prop.children[0];
              const valueNode = prop.children[1];

              if (keyNode.value === 'hdr') {
                hdr = valueNode.value as string;
              }
              if (keyNode.value === 'cmd') {
                cmdProperty = valueNode;
              }
              if (keyNode.value === 'rax') {
                rax = valueNode.value as string;
              }
              if (keyNode.value === 'dbg' && valueNode.value === true) {
                hasDebug = true;
              }
              if (keyNode.value === 'dbgfilter') {
                try {
                  const filterText = document.getText().substring(valueNode.offset, valueNode.offset + valueNode.length);
                  existingDbgFilter = JSON.parse(filterText);
                } catch (e) {
                  // Ignore parse errors
                }
              }
              if (keyNode.value === 'filter') {
                try {
                  const filterText = document.getText().substring(valueNode.offset, valueNode.offset + valueNode.length);
                  commandFilter = JSON.parse(filterText);
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }

          // Check if this command needs debug filter optimization:
          // 1. Has dbg: true (needs new filter), OR
          // 2. Has existing dbgfilter (needs optimization)
          if ((hasDebug || existingDbgFilter) && hdr && cmdProperty) {
            if (hasDebug) commandsWithDebug++;
            let cmdValue: string | Record<string, string> | undefined;

            if (cmdProperty.type === 'object' && cmdProperty.children && cmdProperty.children[0] && cmdProperty.children[0].children) {
              const firstCmdProp = cmdProperty.children[0];
              const cmdKeyNode = firstCmdProp.children![0];
              const cmdValueNode = firstCmdProp.children![1];
              cmdValue = { [cmdKeyNode.value as string]: cmdValueNode.value as string };
            } else if (cmdProperty.type === 'string') {
              cmdValue = cmdProperty.value as string;
            }

            if (cmdValue) {
              const commandId = createSimpleCommandId(hdr, cmdValue, rax);
              const normalizedCommandId = normalizeCommandId(commandId);
              const normalizedStripFilter = normalizeCommandId(stripReceiveFilter(commandId));

              if (commandsWithDebug <= 3) {
                console.log(`Sample command ${commandsWithDebug}: original=${commandId}, normalized=${normalizedCommandId}, stripped=${normalizedStripFilter}`);
                console.log(`  Lookup result:`, batchSupportData.get(normalizedCommandId) || batchSupportData.get(normalizedStripFilter) || 'NOT FOUND');
              }

              const supportData = batchSupportData.get(normalizedCommandId) || batchSupportData.get(normalizedStripFilter) || { supported: [], unsupported: [] };
              const supportedYears = supportData.supported;

              // For commands with dbg:true, we need supported years to create a filter
              // For commands with existing dbgfilter, we can optimize regardless
              const canOptimize = hasDebug ? supportedYears.length > 0 : true;

              if (canOptimize) {
                if (supportedYears.length > 0) {
                  commandsWithSupportedYears++;
                }

                const calculatedFilter = supportedYears.length > 0
                  ? calculateDebugFilter(supportedYears, generationSet, commandFilter)
                  : null;

                if (commandsWithDebug <= 3 || (existingDbgFilter && optimizations.length < 3)) {
                  console.log(`Command ${commandId}: calculatedFilter =`, calculatedFilter, 'existingDbgFilter =', existingDbgFilter);
                }

                // Check if we should add/update the filter
                // - If no existing filter and calculated filter is not empty, add it (dbg:true case)
                // - If existing filter differs from calculated filter, update it (existing dbgfilter case)
                let shouldApply = false;

                if (hasDebug && !existingDbgFilter) {
                  // Case 1: dbg:true without dbgfilter - add new filter if calculated filter is not empty
                  shouldApply = calculatedFilter && Object.keys(calculatedFilter).length > 0;
                } else if (existingDbgFilter) {
                  // Case 2: existing dbgfilter - optimize if different from calculated
                  const existingFilterStr = JSON.stringify(existingDbgFilter);
                  const calculatedFilterStr = JSON.stringify(calculatedFilter || {});
                  shouldApply = existingFilterStr !== calculatedFilterStr;
                }

                if (shouldApply) {
                  const range = new vscode.Range(
                    document.positionAt(commandNode.offset),
                    document.positionAt(commandNode.offset + commandNode.length)
                  );

                  optimizations.push({
                    range,
                    optimizedFilter: calculatedFilter,
                    isNew: hasDebug && !existingDbgFilter
                  });
                }
              }
            }
          }
        }
      }

      console.log(`Total commands: ${totalCommands}, Commands with dbg: ${commandsWithDebug}, Commands with supported years: ${commandsWithSupportedYears}, Optimizations found: ${optimizations.length}`);

      if (optimizations.length === 0) {
        vscode.window.showInformationMessage(`No debug filter optimizations found (checked ${totalCommands} commands, ${commandsWithDebug} with dbg:true, ${commandsWithSupportedYears} with supported years)`);
        return;
      }

      // Ask user for confirmation
      const action = await vscode.window.showInformationMessage(
        `Found ${optimizations.length} debug filter(s) that can be optimized. Apply all optimizations?`,
        'Yes',
        'No'
      );

      if (action !== 'Yes') {
        return;
      }

      // Apply all optimizations in a single edit operation (from bottom to top to preserve positions)
      await editor.edit(editBuilder => {
        // Sort by range start position (descending) to apply from bottom to top
        const sortedOptimizations = [...optimizations].sort((a, b) =>
          b.range.start.compareTo(a.range.start)
        );

        for (const opt of sortedOptimizations) {
          let commandText = document.getText(opt.range);

          // Format the optimized filter with spaces around braces to match style
          const formatDebugFilter = (filter: any): string => {
            const parts: string[] = [];
            if (filter.to !== undefined) parts.push(`"to": ${filter.to}`);
            if (filter.years !== undefined) parts.push(`"years": [${filter.years.join(', ')}]`);
            if (filter.from !== undefined) parts.push(`"from": ${filter.from}`);
            return `{ ${parts.join(', ')} }`;
          };

          const shouldRemoveFilter = opt.optimizedFilter === undefined ||
                                      opt.optimizedFilter === null ||
                                      (typeof opt.optimizedFilter === 'object' && Object.keys(opt.optimizedFilter).length === 0);

          if (shouldRemoveFilter) {
            // Remove the debug filter entirely (if it exists)
            if (!opt.isNew) {
              commandText = commandText.replace(/,\s*"dbgfilter"\s*:\s*\{[^}]*\}(?=\s*[,}])/g, '');
              commandText = commandText.replace(/"dbgfilter"\s*:\s*\{[^}]*\}\s*,/g, '');
            }
            // Also remove dbg: true since filter would be empty
            commandText = commandText.replace(/,\s*"dbg"\s*:\s*true(?=\s*[,}])/g, '');
            commandText = commandText.replace(/"dbg"\s*:\s*true\s*,/g, '');
          } else if (opt.isNew) {
            // Add new debug filter - need to insert it and remove dbg: true
            const optimizedFilterJson = formatDebugFilter(opt.optimizedFilter);

            // Remove dbg: true
            commandText = commandText.replace(/,\s*"dbg"\s*:\s*true(?=\s*[,}])/g, '');
            commandText = commandText.replace(/"dbg"\s*:\s*true\s*,/g, '');

            // Find where to insert the dbgfilter - after command properties but before signals
            const signalsMatch = commandText.match(/,\s*"signals"\s*:/);

            if (signalsMatch && signalsMatch.index !== undefined) {
              // Insert before the "signals" property
              const insertPosition = signalsMatch.index;
              const beforeSignals = commandText.substring(0, insertPosition);
              const fromSignals = commandText.substring(insertPosition);
              commandText = beforeSignals + `, "dbgfilter": ${optimizedFilterJson}` + fromSignals;
            } else {
              // Fallback: insert before the closing brace if no signals found
              const closingBraceIndex = commandText.lastIndexOf('}');
              if (closingBraceIndex !== -1) {
                const beforeClosingBrace = commandText.substring(0, closingBraceIndex).trim();
                const needsComma = beforeClosingBrace.endsWith('"') || beforeClosingBrace.endsWith('}') || beforeClosingBrace.endsWith(']');
                const formattedDebugFilter = `${needsComma ? ', ' : ''}"dbgfilter": ${optimizedFilterJson}`;
                const beforeBrace = commandText.substring(0, closingBraceIndex);
                const afterBrace = commandText.substring(closingBraceIndex);
                commandText = beforeBrace + formattedDebugFilter + afterBrace;
              }
            }
          } else {
            // Update existing debug filter
            const optimizedFilterJson = formatDebugFilter(opt.optimizedFilter);
            commandText = commandText.replace(/"dbgfilter"\s*:\s*\{[^}]*\}/g, `"dbgfilter": ${optimizedFilterJson}`);
          }

          editBuilder.replace(opt.range, commandText);
        }
      });

      vscode.window.showInformationMessage(`Successfully optimized ${optimizations.length} debug filter(s)`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to optimize debug filters: ${error}`);
      console.error('Error in optimizeAllDebugFilters:', error);
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

  // Register MCP server provider
  const mcpServerProvider = registerMcpServerProvider(context);

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
    optimizeFilterCommand,
    addRaxFilterCommand,
    optimizeAllDebugFiltersCommand,
    ...testCommands,
    testExplorer,
    testExecutionSubscription,
    testDiagnosticCollection
  );

  // Add MCP server provider if registered
  if (mcpServerProvider) {
    context.subscriptions.push(mcpServerProvider);
  }
}

/**
 * Registers the MCP server provider for OBDb signalsets
 * @param context The extension context
 * @returns Disposable for the registration, or undefined if MCP API not available
 */
function registerMcpServerProvider(context: vscode.ExtensionContext): vscode.Disposable | undefined {
  // Check if the MCP API is available
  console.log('[OBDb MCP] Checking for MCP API...');
  console.log('[OBDb MCP] vscode.lm exists:', 'lm' in vscode);
  if ('lm' in vscode) {
    console.log('[OBDb MCP] vscode.lm properties:', Object.keys((vscode as any).lm));
  }

  if (!('lm' in vscode) || !('registerMcpServerDefinitionProvider' in (vscode as any).lm)) {
    console.log('[OBDb MCP] MCP API not available - Claude Code may not be installed or API not ready');
    return undefined;
  }

  try {
    const serverPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp', 'server.js').fsPath;

    const provider = (vscode as any).lm.registerMcpServerDefinitionProvider(
      'obdb-signalsets-provider',
      {
        // Event that fires when server definitions change
        onDidChangeMcpServerDefinitions: new vscode.EventEmitter<void>().event,

        // Provide the list of MCP servers
        provideMcpServerDefinitions: async () => {
          // Only provide the server if we're in a workspace
          if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return [];
          }

          return [{
            id: 'obdb-signalsets',
            label: 'OBDb Signalsets',
            description: 'Query and manage OBDb signal definitions, commands, and support matrices',
            type: 'stdio',
            command: 'node',
            args: [serverPath],
            env: {
              OBDB_WORKSPACE_ROOT: vscode.workspace.workspaceFolders[0].uri.fsPath
            }
          }];
        },

        // Resolve the server definition when it needs to start
        resolveMcpServerDefinition: async (server: any) => {
          // No additional resolution needed - just return the server as-is
          return server;
        }
      }
    );

    console.log('[OBDb MCP] Successfully registered MCP server provider');
    console.log('[OBDb MCP] Server path:', serverPath);
    return provider;
  } catch (error) {
    console.error('[OBDb MCP] Failed to register MCP server provider:', error);
    return undefined;
  }
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