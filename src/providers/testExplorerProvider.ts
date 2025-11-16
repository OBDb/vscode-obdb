import * as vscode from 'vscode';
import * as path from 'path';
import * as YAML from 'yaml';
import * as fs from 'fs';
import { testExecutionEvent } from '../utils/testCommands';
import {
    Generation,
    getGenerations,
    getGenerationForModelYear
} from '../utils/generations';
import { PerformanceMonitor } from '../utils/performanceMonitor';

/**
 * A class that manages test items in the VS Code Test Explorer
 */
export class TestExplorerProvider {
    private testController: vscode.TestController;
    private fileWatcher: vscode.FileSystemWatcher;
    private yamlTestItems: Map<string, vscode.TestItem> = new Map();
    private disposables: vscode.Disposable[] = [];
    private activeRuns: Map<string, vscode.TestRun> = new Map();
    private generationsFileWatcher: vscode.FileSystemWatcher | null = null;

    /**
     * Creates a new TestExplorerProvider
     */
    constructor() {
        // Create a controller to handle test data
        this.testController = vscode.tests.createTestController('obdbTests', 'OBDb Tests');
        this.disposables.push(this.testController);

        // Create a run profile for the tests
        this.testController.createRunProfile(
            'Run Tests',
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runHandler(request, token),
            true
        );

        // Create a debug profile for the tests
        this.testController.createRunProfile(
            'Debug Tests',
            vscode.TestRunProfileKind.Debug,
            (request, token) => this.runHandler(request, token, true),
            true
        );

        // Create a file watcher to detect changes to YAML test files
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/test_cases/**/commands/*.yaml');
        this.disposables.push(this.fileWatcher);

        // Add file watcher event handlers
        this.fileWatcher.onDidCreate(uri => this.onYamlFileChanged(uri));
        this.fileWatcher.onDidChange(uri => this.onYamlFileChanged(uri));
        this.fileWatcher.onDidDelete(uri => this.onYamlFileDeleted(uri));

        // Subscribe to test execution events from CodeLens actions
        this.disposables.push(testExecutionEvent.event(this.handleTestExecutionEvent.bind(this)));

        // Create a file watcher for the generations.yaml file
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const generationsPattern = new vscode.RelativePattern(
                vscode.workspace.workspaceFolders[0],
                'generations.yaml'
            );
            this.generationsFileWatcher = vscode.workspace.createFileSystemWatcher(generationsPattern);
            this.disposables.push(this.generationsFileWatcher);

            // Reload generations and refresh tests when the file changes
            this.generationsFileWatcher.onDidChange(() => {
                this.rebuildTestHierarchy();
            });
            this.generationsFileWatcher.onDidCreate(() => {
                this.rebuildTestHierarchy();
            });
            this.generationsFileWatcher.onDidDelete(() => {
                this.rebuildTestHierarchy();
            });
        }

        // Initial load of test items
        this.loadAllTestFiles();
    }

    /**
     * Disposes resources held by the provider
     */
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }

    /**
     * Rebuilds the test hierarchy based on the current generations configuration
     */
    private rebuildTestHierarchy(): void {
        // Clear existing test items
        this.testController.items.replace([]);
        this.yamlTestItems.clear();

        // Reload all test files with the new structure
        this.loadAllTestFiles();
    }

    /**
     * Loads all test files in the workspace
     */
    private async loadAllTestFiles() {
        const opId = `test-explorer-load-all-${Date.now()}`;
        PerformanceMonitor.startTimer(opId, 'TestExplorerProvider.loadAllTestFiles', {});

        if (!vscode.workspace.workspaceFolders) {
            PerformanceMonitor.endTimer(opId, 'TestExplorerProvider.loadAllTestFiles', { result: 'no-workspace' });
            return;
        }

        let totalFiles = 0;
        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            const pattern = new vscode.RelativePattern(
                workspaceFolder,
                '**/test_cases/**/commands/*.{yaml,yml}'
            );

            const files = await vscode.workspace.findFiles(pattern);
            totalFiles += files.length;

            for (const file of files) {
                await this.addTestItemsFromFile(file);
            }
        }

        PerformanceMonitor.endTimer(opId, 'TestExplorerProvider.loadAllTestFiles', {
            result: 'success',
            filesLoaded: totalFiles
        });
    }

    /**
     * Handles when a YAML file is created or changed
     * @param uri URI of the YAML file
     */
    private async onYamlFileChanged(uri: vscode.Uri) {
        const filePath = uri.fsPath;
        if (this.isTestFile(filePath)) {
            await this.addTestItemsFromFile(uri);
        }
    }

    /**
     * Handles when a YAML file is deleted
     * @param uri URI of the deleted YAML file
     */
    private onYamlFileDeleted(uri: vscode.Uri) {
        // Remove test items for the deleted file
        const filePath = uri.fsPath;
        const fileTestItem = this.yamlTestItems.get(filePath);

        if (fileTestItem) {
            // Find the parent item and remove the test from it
            // Iterate through all top-level items
            const topLevelItemsArray = [...this.testController.items];

            for (const [topItemId, topItem] of topLevelItemsArray) {
                let found = false;

                // Check if it's directly in a model year item
                if (topItem.children.get(fileTestItem.id)) {
                    topItem.children.delete(fileTestItem.id);
                    found = true;
                } else {
                    // Check in generation > model year hierarchy
                    // Convert children to array we can iterate
                    const yearItemsArray = [...topItem.children];

                    for (const [yearItemId, yearItem] of yearItemsArray) {
                        if (yearItem.children.get(fileTestItem.id)) {
                            yearItem.children.delete(fileTestItem.id);

                            // If model year is now empty, remove it too
                            if (yearItem.children.size === 0) {
                                topItem.children.delete(yearItemId);
                            }

                            found = true;
                            break;
                        }
                    }
                }

                // If the top-level item is now empty, remove it
                if (found && topItem.children.size === 0) {
                    this.testController.items.delete(topItemId);
                }
            }

            this.yamlTestItems.delete(filePath);
        }
    }

    /**
     * Adds test items from a YAML file
     * @param uri URI of the YAML file
     */
    private async addTestItemsFromFile(uri: vscode.Uri) {
        const opId = `test-explorer-add-${Date.now()}-${Math.random()}`;
        PerformanceMonitor.startTimer(opId, 'TestExplorerProvider.addTestItemsFromFile', {
            filePath: uri.fsPath
        });

        try {
            const filePath = uri.fsPath;

            // Check if this is a test file
            if (!this.isTestFile(filePath)) {
                PerformanceMonitor.endTimer(opId, 'TestExplorerProvider.addTestItemsFromFile', { result: 'not-test-file' });
                return;
            }

            // Read the file content
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            // Parse YAML content with source positions enabled
            const parseStartTime = performance.now();
            const yamlDoc = YAML.parseDocument(content, { keepSourceTokens: true });
            const yamlContent = yamlDoc.toJSON();
            const parseTime = performance.now() - parseStartTime;
            PerformanceMonitor.logMetric('TestExplorerProvider.parseYAML', parseTime, { filePath });

            // Check if this has the expected structure for a test file
            if (!yamlContent || !yamlContent.test_cases || !Array.isArray(yamlContent.test_cases)) {
                PerformanceMonitor.endTimer(opId, 'TestExplorerProvider.addTestItemsFromFile', { result: 'invalid-structure' });
                return;
            }

            // Extract model year from the path
            const pathParts = filePath.split('/');
            const modelYearIndex = pathParts.indexOf('test_cases') + 1;
            const modelYear = (modelYearIndex < pathParts.length) ? pathParts[modelYearIndex] : 'unknown';

            // Get command ID
            const commandId = yamlContent.command_id || path.basename(filePath, path.extname(filePath));

            // Check if this model year belongs to a generation
            const generation = await getGenerationForModelYear(modelYear);

            // Create or update items based on whether we have a generation
            if (generation) {
                // We have a generation - use a generation > model year > command hierarchy
                this.addTestWithGenerationHierarchy(uri, filePath, modelYear, commandId, yamlContent, generation);
            } else {
                // No generation - use a model year > command hierarchy
                this.addTestWithModelYearHierarchy(uri, filePath, modelYear, commandId, yamlContent);
            }

            PerformanceMonitor.endTimer(opId, 'TestExplorerProvider.addTestItemsFromFile', {
                result: 'success',
                modelYear,
                commandId,
                testCount: yamlContent.test_cases.length,
                hasGeneration: !!generation
            });

        } catch (error) {
            PerformanceMonitor.endTimer(opId, 'TestExplorerProvider.addTestItemsFromFile', {
                result: 'error',
                error: String(error)
            });
            console.error("Error adding test items from file:", error);
        }
    }

    /**
     * Adds a test using the generation > model year > command hierarchy
     */
    private addTestWithGenerationHierarchy(
        uri: vscode.Uri,
        filePath: string,
        modelYear: string,
        commandId: string,
        yamlContent: any,
        generation: Generation
    ) {
        // Create or get the generation item
        const generationItemId = `generation-${generation.start_year}-${generation.end_year || 'present'}`;
        let generationItem = this.testController.items.get(generationItemId);

        if (!generationItem) {
            const endYearText = generation.end_year ? generation.end_year.toString() : 'Present';
            generationItem = this.testController.createTestItem(
                generationItemId,
                generation.name,
                uri
            );
            generationItem.description = `${generation.start_year}-${endYearText}`;
            this.testController.items.add(generationItem);
        }

        // Create or get the model year item under the generation
        const modelYearItemId = `model-year-${modelYear}`;
        let modelYearItem = generationItem.children.get(modelYearItemId);

        if (!modelYearItem) {
            modelYearItem = this.testController.createTestItem(
                modelYearItemId,
                `Model Year ${modelYear}`,
                uri
            );
            generationItem.children.add(modelYearItem);
        }

        // Create or update the command test item
        const commandItemId = `command-${commandId}-${modelYear}`;
        let commandItem = modelYearItem.children.get(commandItemId);

        if (!commandItem) {
            commandItem = this.testController.createTestItem(
                commandItemId,
                `${commandId}`,
                uri
            );
            modelYearItem.children.add(commandItem);
        }

        // Find the range for test_cases in the document
        this.updateCommandItemWithTestCases(uri, commandItem, yamlContent);

        // Store the test item in our map
        this.yamlTestItems.set(filePath, commandItem);
    }

    /**
     * Adds a test using the model year > command hierarchy (when no generations are defined)
     */
    private addTestWithModelYearHierarchy(
        uri: vscode.Uri,
        filePath: string,
        modelYear: string,
        commandId: string,
        yamlContent: any
    ) {
        // Create or update the model year test item
        let modelYearItem = this.testController.items.get(`model-year-${modelYear}`);
        if (!modelYearItem) {
            modelYearItem = this.testController.createTestItem(
                `model-year-${modelYear}`,
                `Model Year ${modelYear}`,
                vscode.Uri.file(path.dirname(path.dirname(filePath)))
            );
            this.testController.items.add(modelYearItem);
        }

        // Create or update the command test item
        const commandItemId = `command-${commandId}-${modelYear}`;
        let commandItem = modelYearItem.children.get(commandItemId);
        if (!commandItem) {
            commandItem = this.testController.createTestItem(
                commandItemId,
                `${commandId}`,
                uri
            );
            modelYearItem.children.add(commandItem);
        }

        // Update command item with test cases information
        this.updateCommandItemWithTestCases(uri, commandItem, yamlContent);

        // Store the test item in our map
        this.yamlTestItems.set(filePath, commandItem);
    }

    /**
     * Updates a command test item with test cases information
     */
    private async updateCommandItemWithTestCases(
        uri: vscode.Uri,
        commandItem: vscode.TestItem,
        yamlContent: any
    ) {
        try {
            // Read the document to find positions
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            // Find the range for test_cases in the document
            const testCasesPattern = /test_cases:/g;
            const match = testCasesPattern.exec(content);
            if (match) {
                const matchStart = match.index;
                const startPos = document.positionAt(matchStart);
                const endPos = document.positionAt(matchStart + match[0].length);
                commandItem.range = new vscode.Range(startPos, endPos);
            }

            // Store test count information
            if (yamlContent.test_cases && Array.isArray(yamlContent.test_cases)) {
                commandItem.description = `${yamlContent.test_cases.length} test case(s)`;
            }
        } catch (error) {
            console.error("Error updating command item with test cases:", error);
        }
    }

    /**
     * Check if a file is a test file based on its path
     * @param filePath The path to check
     * @returns True if this is a test file
     */
    private isTestFile(filePath: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        // Match paths like test_cases/{model_year}/commands/{test_case}.yaml
        return /test_cases\/\d+\/commands\/[^\/]+\.ya?ml$/i.test(normalizedPath);
    }

    /**
     * Handles test execution events from CodeLens actions
     * @param event The test execution event
     */
    private handleTestExecutionEvent(event: {
        uri: vscode.Uri;
        success: boolean;
        testIndex?: number;
        isDebug: boolean;
        errorMessage?: string;
    }) {
        const filePath = event.uri.fsPath;
        const testItem = this.yamlTestItems.get(filePath);

        if (!testItem) {
            // Test item not found, possibly not loaded yet
            return;
        }

        // Create a test run that matches what the user would see in the Test Explorer
        const kind = event.isDebug ? vscode.TestRunProfileKind.Debug : vscode.TestRunProfileKind.Run;
        const runId = `${filePath}-${kind}-${Date.now()}`;

        // Check if there's an existing run for this file and kind
        let run = this.activeRuns.get(runId);

        if (!run) {
            // Create a new run with just this test
            const request = new vscode.TestRunRequest([testItem]);
            run = this.testController.createTestRun(request, runId);
            this.activeRuns.set(runId, run);
        }

        // Mark test as running
        run.started(testItem);

        // Update test state based on execution result
        if (event.success) {
            run.passed(testItem);
        } else {
            const errorMessage = event.errorMessage || 'Test execution failed';
            run.failed(testItem, new vscode.TestMessage(errorMessage));
        }

        // Complete the run after a brief delay
        setTimeout(() => {
            run?.end();
            this.activeRuns.delete(runId);
        }, 500);
    }

    /**
     * Run handler for test run requests
     * @param request The test run request
     * @param token Cancellation token
     * @param isDebug Whether this is a debug run
     */
    private async runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        isDebug: boolean = false
    ): Promise<void> {
        const run = this.testController.createTestRun(request);
        const queue: vscode.TestItem[] = [];

        // If specific tests were selected, enqueue those
        if (request.include) {
            request.include.forEach(test => queue.push(test));
        } else {
            // Otherwise, enqueue all tests
            this.testController.items.forEach(test => queue.push(test));
        }

        // Process the queue
        while (queue.length > 0 && !token.isCancellationRequested) {
            const test = queue.shift()!;

            // Skip tests that should be excluded
            if (request.exclude?.some(excluded => excluded.id === test.id)) {
                continue;
            }

            // If this is a container with children, enqueue the children
            if (test.children.size > 0) {
                test.children.forEach(child => queue.push(child));
                continue;
            }

            // This is a leaf node (actual test file), so run it
            await this.runTestFile(test, run, isDebug);
        }

        // Complete the run
        run.end();
    }

    /**
     * Run all tests in a test file
     * @param test The test item representing the file
     * @param run The test run
     * @param isDebug Whether this is a debug run
     */
    private async runTestFile(
        test: vscode.TestItem,
        run: vscode.TestRun,
        isDebug: boolean
    ): Promise<void> {
        // Mark test as running
        run.started(test);

        try {
            // Run the appropriate command based on whether this is a debug run
            const command = isDebug ? 'obdb.debugAllTests' : 'obdb.runAllTests';

            // Execute the command with the file URI
            await vscode.commands.executeCommand(command, test.uri);

            // For demonstration purposes, mark all tests as passed
            // In a real implementation, you would want to capture the results
            run.passed(test);
        } catch (error) {
            // If there was an error, mark the test as errored
            console.error(`Error running tests in ${test.id}:`, error);
            run.errored(test, new vscode.TestMessage(`Error: ${error}`));
        }
    }
}

/**
 * Create and register the test explorer provider
 * @param context The extension context
 * @returns The disposable for the registered test provider
 */
export function registerTestExplorer(context: vscode.ExtensionContext): vscode.Disposable {
    const testExplorerProvider = new TestExplorerProvider();

    // Push the provider to context subscriptions to ensure disposal
    context.subscriptions.push(testExplorerProvider);

    return testExplorerProvider;
}