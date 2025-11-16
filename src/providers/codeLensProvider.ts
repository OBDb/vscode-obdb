import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { getCommandSupportInfo, createSimpleCommandId, optimizeDebugFilter, batchLoadAllCommandSupport, normalizeCommandId, stripReceiveFilter } from '../utils/commandSupportUtils';
import { groupModelYearsByGeneration, formatYearsAsRanges, getGenerationForModelYear, getGenerations } from '../utils/generations';
import { CommandSupportCache } from '../caches/commands/commandSupportCache';
import { PerformanceMonitor } from '../utils/performanceMonitor';
import { calculateDebugFilter } from '../utils/debugFilterCalculator';
import { GenerationSet } from '../utils/generationsCore';
import { calculateOptimizedFilter } from '../utils/filterOptimizer';

interface DocumentCodeLensCache {
  version: number;
  codeLenses: vscode.CodeLens[];
}

export class CommandCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;
  private documentCache: Map<string, DocumentCodeLensCache> = new Map();
  private cache: CommandSupportCache;
  private testFileWatcher: vscode.FileSystemWatcher | undefined;
  private invalidationTimer: NodeJS.Timeout | undefined;
  private readonly DEBOUNCE_DELAY_MS = 5000; // 5 seconds

  constructor(cache: CommandSupportCache) {
    this.cache = cache;
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.languageId === 'json' && (event.document.fileName.includes('signalsets') || event.document.fileName.includes('commands'))) {
        // Clear the cache for this document immediately when it changes
        this.documentCache.delete(event.document.uri.toString());
        // Schedule debounced invalidation
        this.scheduleInvalidation();
      }
    });

    // Set up file system watcher for test files
    this.setupTestFileWatcher();
  }

  private setupTestFileWatcher(): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return;
    }

    // Watch for changes in the tests directory
    const testsPattern = new vscode.RelativePattern(workspaceRoot, 'tests/**/*.{yaml,yml}');
    this.testFileWatcher = vscode.workspace.createFileSystemWatcher(testsPattern);

    // When any test file changes, schedule debounced cache invalidation
    const handleTestFileChange = () => {
      this.scheduleInvalidation();
    };

    this.testFileWatcher.onDidChange(handleTestFileChange);
    this.testFileWatcher.onDidCreate(handleTestFileChange);
    this.testFileWatcher.onDidDelete(handleTestFileChange);
  }

  private scheduleInvalidation(): void {
    // Cancel any existing timer
    if (this.invalidationTimer) {
      clearTimeout(this.invalidationTimer);
    }

    // Schedule a new invalidation
    this.invalidationTimer = setTimeout(() => {
      this.performInvalidation();
      this.invalidationTimer = undefined;
    }, this.DEBOUNCE_DELAY_MS);
  }

  private performInvalidation(): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      this.cache.clearWorkspace(workspaceRoot);
    }
    this.documentCache.clear();
    this.onDidChangeCodeLensesEmitter.fire();
  }

  dispose(): void {
    if (this.invalidationTimer) {
      clearTimeout(this.invalidationTimer);
      this.invalidationTimer = undefined;
    }
    this.testFileWatcher?.dispose();
  }

  /**
   * Detect the vehicle generation based on file path or supported years
   * This is a heuristic approach - in a real implementation you might want to
   * read vehicle configuration from a specific file or user setting
   */
  private async detectVehicleGeneration(fileName: string, supportedYears: string[]): Promise<any> {
    // For now, we'll try to determine generation from the first supported year
    if (supportedYears.length === 0) {
      return null;
    }

    // Sort years and take the first one as a reference
    const sortedYears = supportedYears.map(y => parseInt(y, 10)).sort((a, b) => a - b);
    const firstYear = sortedYears[0].toString();

    // Use the generation utility to find the generation for this year
    return await getGenerationForModelYear(firstYear);
  }

  /**
   * Calculate suggested rax value by adding 8 to the hex hdr value
   * @param hdr The header value as a hex string (e.g., "7E0")
   * @returns The suggested rax value as a hex string (e.g., "7E8")
   */
  private calculateSuggestedRax(hdr: string): string | null {
    try {
      // Only 11-bit headers (3 characters) are supported.
      if (hdr.length !== 3) {
        return null; // Invalid header length for this calculation
      }
      // Parse hex string to number, add 8, convert back to hex
      const hdrNum = parseInt(hdr, 16);
      if (isNaN(hdrNum)) {
        return null;
      }
      if (hdrNum == 0x7DF) {
        return null;
      }
      const raxNum = hdrNum + 8;
      return raxNum.toString(16).toUpperCase();
    } catch (e) {
      return null;
    }
  }

  async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    const opId = `codelens-${Date.now()}-${Math.random()}`;
    PerformanceMonitor.startTimer(opId, 'CodeLensProvider.provideCodeLenses', {
      fileName: document.fileName,
      version: document.version
    });

    try {
      if (!document.fileName.includes('signalsets') && !document.fileName.includes('commands')) {
        PerformanceMonitor.endTimer(opId, 'CodeLensProvider.provideCodeLenses', { result: 'not-applicable' });
        return [];
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        PerformanceMonitor.endTimer(opId, 'CodeLensProvider.provideCodeLenses', { result: 'no-workspace' });
        return [];
      }

      // Check if we have a cached version for this document
      const documentUri = document.uri.toString();
      const cachedEntry = this.documentCache.get(documentUri);

      if (cachedEntry && cachedEntry.version === document.version) {
        PerformanceMonitor.endTimer(opId, 'CodeLensProvider.provideCodeLenses', {
          result: 'cache-hit',
          codeLensCount: cachedEntry.codeLenses.length
        });
        return cachedEntry.codeLenses;
      }

    const codeLenses: vscode.CodeLens[] = [];

    const text = document.getText();
    const rootNode = jsonc.parseTree(text);

    // Batch load ALL command support data upfront (O(m) where m = number of years)
    const batchLoadStartTime = performance.now();
    let batchSupportData = this.cache.getBatchCommandSupport(workspaceRoot);
    if (!batchSupportData) {
      batchSupportData = await batchLoadAllCommandSupport(workspaceRoot, this.cache);
      this.cache.setBatchCommandSupport(workspaceRoot, batchSupportData);
    }
    const batchLoadTime = performance.now() - batchLoadStartTime;
    PerformanceMonitor.logMetric('CodeLensProvider.batchLoadCommandSupport', batchLoadTime, {
      fileName: document.fileName,
      commandCount: batchSupportData.size,
      cached: batchLoadTime < 5
    });

    if (rootNode && rootNode.type === 'object') {
      const commandsProperty = jsonc.findNodeAtLocation(rootNode, ['commands']);
      if (commandsProperty && commandsProperty.type === 'array' && commandsProperty.children) {
        for (const commandNode of commandsProperty.children) {
          if (commandNode.type === 'object' && commandNode.children) {
            let hdr: string | undefined;
            let cmdProperty: jsonc.Node | undefined;
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
                    // Ignore parse errors for existing filter
                  }
                }
                if (keyNode.value === 'filter') {
                  try {
                    const filterText = document.getText().substring(valueNode.offset, valueNode.offset + valueNode.length);
                    commandFilter = JSON.parse(filterText);
                  } catch (e) {
                    // Ignore parse errors for filter
                  }
                }
              }
            }

            if (hdr && cmdProperty) {
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
                const range = new vscode.Range(
                  document.positionAt(commandNode.offset),
                  document.positionAt(commandNode.offset + commandNode.length)
                );

                // Use batch-loaded data instead of individual lookups (O(1) instead of O(m))
                const normalizedCommandId = normalizeCommandId(commandId);
                const normalizedStripFilter = normalizeCommandId(stripReceiveFilter(commandId));
                const supportData = batchSupportData.get(normalizedCommandId) || batchSupportData.get(normalizedStripFilter) || { supported: [], unsupported: [] };
                const supportedYears = supportData.supported;
                const unsupportedYears = supportData.unsupported;

                // Filter out any years from unsupportedYears that are also in supportedYears
                const finalUnsupportedYears = unsupportedYears.filter(year => !supportedYears.includes(year));

                let title = '';
                if (supportedYears.length === 0 && finalUnsupportedYears.length === 0) {
                  title += 'No information available.';
                } else {
                  if (supportedYears.length > 0) {
                    title += `✅ Supported: ${formatYearsAsRanges(supportedYears)}`;
                  }
                  if (finalUnsupportedYears.length > 0) {
                    if (supportedYears.length > 0) title += ' | ';
                    title += `❌ Unsupported: ${formatYearsAsRanges(finalUnsupportedYears)}`;
                  }
                }                const codeLens = new vscode.CodeLens(range, { title: title, command: '' });
                codeLenses.push(codeLens);

                // Add debug filter suggestion if command has dbg: true
                if (hasDebug && supportedYears.length > 0) {
                  // Get all generations and create a GenerationSet
                  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  if (workspacePath) {
                    const generations = await getGenerations(workspacePath);
                    if (generations && generations.length > 0) {
                      const generationSet = new GenerationSet(generations);
                      const debugFilter = calculateDebugFilter(supportedYears, generationSet, commandFilter);

                      if (debugFilter && Object.keys(debugFilter).length > 0) {
                        const debugFilterRange = new vscode.Range(
                          document.positionAt(commandNode.offset),
                          document.positionAt(commandNode.offset + commandNode.length)
                        );

                        const debugFilterTitle = `🔧 Apply optimized debug filter`;
                        const debugFilterCodeLens = new vscode.CodeLens(debugFilterRange, {
                          title: debugFilterTitle,
                          command: 'obdb.applyDebugFilter',
                          arguments: [{
                            documentUri: document.uri.toString(),
                            commandRange: debugFilterRange,
                            debugFilter: debugFilter
                          }]
                        });
                        codeLenses.push(debugFilterCodeLens);
                      }
                    }
                  }
                }

                // Suggest adding rax filter if missing
                if (!rax && hdr) {
                  const suggestedRax = this.calculateSuggestedRax(hdr);
                  if (suggestedRax) {
                    const raxSuggestionRange = new vscode.Range(
                      document.positionAt(commandNode.offset),
                      document.positionAt(commandNode.offset + commandNode.length)
                    );

                    const raxSuggestionTitle = `💡 Add rax filter: "${suggestedRax}"`;
                    const raxSuggestionCodeLens = new vscode.CodeLens(raxSuggestionRange, {
                      title: raxSuggestionTitle,
                      command: 'obdb.addRaxFilter',
                      arguments: [{
                        documentUri: document.uri.toString(),
                        commandRange: raxSuggestionRange,
                        suggestedRax: suggestedRax
                      }]
                    });
                    codeLenses.push(raxSuggestionCodeLens);
                  }
                }

                // Check existing debug filter for optimization opportunities
                if (existingDbgFilter && supportedYears.length > 0) {
                  // Calculate what the debug filter should be based on supported years and command filter
                  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  if (workspacePath) {
                    const generations = await getGenerations(workspacePath);
                    if (generations && generations.length > 0) {
                      const generationSet = new GenerationSet(generations);
                      const calculatedFilter = calculateDebugFilter(supportedYears, generationSet, commandFilter);

                      // Check if the existing filter differs from the calculated optimal filter
                      const existingFilterStr = JSON.stringify(existingDbgFilter);
                      const calculatedFilterStr = JSON.stringify(calculatedFilter || {});

                      if (existingFilterStr !== calculatedFilterStr) {
                        const optimizeRange = new vscode.Range(
                          document.positionAt(commandNode.offset),
                          document.positionAt(commandNode.offset + commandNode.length)
                        );

                        const optimizeTitle = calculatedFilter === null || Object.keys(calculatedFilter).length === 0
                          ? '🗑️ Remove debug filter (all years supported)'
                          : '⚡ Optimize debug filter';

                        const optimizeCodeLens = new vscode.CodeLens(optimizeRange, {
                          title: optimizeTitle,
                          command: 'obdb.optimizeDebugFilter',
                          arguments: [{
                            documentUri: document.uri.toString(),
                            commandRange: optimizeRange,
                            optimizedFilter: calculatedFilter
                          }]
                        });
                        codeLenses.push(optimizeCodeLens);
                      }
                    }
                  }
                }

                // Check command filter for optimization opportunities
                if (supportedYears.length > 0 || finalUnsupportedYears.length > 0) {
                  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  if (workspacePath) {
                    const generations = await getGenerations(workspacePath);
                    if (generations && generations.length > 0) {
                      const generationSet = new GenerationSet(generations);
                      const optimizedFilter = calculateOptimizedFilter(supportedYears, finalUnsupportedYears, generationSet);

                      // Compare with existing command filter
                      const existingFilterStr = JSON.stringify(commandFilter || {});
                      const optimizedFilterStr = JSON.stringify(optimizedFilter || {});

                      if (existingFilterStr !== optimizedFilterStr && optimizedFilter !== null) {
                        const filterOptimizeRange = new vscode.Range(
                          document.positionAt(commandNode.offset),
                          document.positionAt(commandNode.offset + commandNode.length)
                        );

                        const filterOptimizeTitle = Object.keys(optimizedFilter).length === 0
                          ? '🗑️ Remove filter (all years supported/uncertain)'
                          : '🎯 Optimize filter';

                        const filterOptimizeCodeLens = new vscode.CodeLens(filterOptimizeRange, {
                          title: filterOptimizeTitle,
                          command: 'obdb.optimizeFilter',
                          arguments: [{
                            documentUri: document.uri.toString(),
                            commandRange: filterOptimizeRange,
                            optimizedFilter: optimizedFilter
                          }]
                        });
                        codeLenses.push(filterOptimizeCodeLens);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

      // Cache the result
      this.documentCache.set(documentUri, {
        version: document.version,
        codeLenses: codeLenses
      });

      PerformanceMonitor.endTimer(opId, 'CodeLensProvider.provideCodeLenses', {
        result: 'computed',
        codeLensCount: codeLenses.length,
        commandCount: codeLenses.filter(cl => cl.command?.title.includes('Supported')).length
      });

      return codeLenses;
    } catch (error) {
      PerformanceMonitor.endTimer(opId, 'CodeLensProvider.provideCodeLenses', {
        result: 'error',
        error: String(error)
      });
      throw error;
    }
  }
}

export function createCodeLensProvider(cache: CommandSupportCache): vscode.Disposable {
  const provider = new CommandCodeLensProvider(cache);
  const registration = vscode.languages.registerCodeLensProvider(
    { language: 'json', pattern: '**/{signalsets,commands}/**/*.json' },
    provider
  );

  // Return a composite disposable that cleans up both the registration and the provider
  return {
    dispose: () => {
      registration.dispose();
      provider.dispose();
    }
  };
}
