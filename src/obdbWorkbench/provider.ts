import * as vscode from 'vscode';
import { isPositionInCommand, getSampleCommandResponses, generateCommandIdFromDefinition } from '../utils/commandParser';
import { extractSignals } from './signalExtractor';
import { generateBitmapHtml } from './htmlGenerator';
import { getWebviewContent } from './webviewContent';

/**
 * Provider for the OBDb Workbench webview in the sidebar
 */
export class OBDbWorkbenchProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'obdb.workbench';

  private _view?: vscode.WebviewView;
  private currentCommand: any | undefined;
  private sourceDocument: vscode.TextDocument | undefined;
  private currentCancellationTokenSource: vscode.CancellationTokenSource | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
  ) {
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for document and editor changes
   */
  private setupEventListeners() {
    // Listen for text document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        // If this is our source document, update the visualization
        if (this.sourceDocument && event.document.uri.toString() === this.sourceDocument.uri.toString()) {
          this.updateVisualization(event.document);
        }
      })
    );

    // Listen for cursor movement
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor.document.languageId === 'json') {
          // Update or set the source document when making a selection in a JSON file
          this.sourceDocument = event.textEditor.document;
          this.updateVisualizationFromCursor(event.textEditor);
        }
      })
    );

    // Listen for document closing
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument(document => {
        // Check if the closed document was being visualized
        if (this.sourceDocument &&
            document.uri.toString() === this.sourceDocument.uri.toString()) {
          // Clear the visualization when the source document is closed
          this.currentCommand = undefined;
          this.sourceDocument = undefined;
          this.showEmptyState();
        }
      })
    );

    // Listen for editor activation
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'json') {
          // Set this as the source document
          this.sourceDocument = editor.document;
          // Update visualization from cursor position
          this.updateVisualizationFromCursor(editor);
        } else if (editor) {
          // Show empty state when switching to non-JSON files
          this.currentCommand = undefined;
          this.showEmptyState();
        }
      })
    );
  }

  /**
   * Called when the view is first resolved
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // If we have an active JSON editor, start visualizing it
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'json') {
      this.sourceDocument = activeEditor.document;
      this.updateVisualizationFromCursor(activeEditor);
    } else {
      this.showEmptyState();
    }

    // Handle view disposal
    webviewView.onDidDispose(() => {
      this._view = undefined;
    });
  }

  /**
   * Show empty state when no command is selected
   */
  private showEmptyState() {
    if (!this._view) {
      return;
    }

    this._view.webview.html = this.getEmptyStateHtml();
  }

  /**
   * Generate HTML for empty state
   */
  private getEmptyStateHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      padding: 20px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
    }
    .empty-state {
      opacity: 0.6;
    }
    .empty-state h2 {
      font-size: 16px;
      margin-bottom: 10px;
    }
    .empty-state p {
      font-size: 13px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="empty-state">
    <h2>No Command Selected</h2>
    <p>Open a JSON signalset file and position your cursor within a command object to view its bitmap visualization.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Cancel any currently running visualization update operations
   */
  private cancelCurrentOperations() {
    if (this.currentCancellationTokenSource) {
      this.currentCancellationTokenSource.cancel();
      this.currentCancellationTokenSource.dispose();
      this.currentCancellationTokenSource = undefined;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /**
   * Update visualization based on changed document
   */
  private async updateVisualization(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'json') return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) return;

    // Always update from cursor position, ignoring any potential mouse position
    this.updateVisualizationFromCursor(editor);
  }

  /**
   * Update visualization based on cursor position
   */
  private async updateVisualizationFromCursor(editor: vscode.TextEditor): Promise<void> {
    if (!editor || editor.document.languageId !== 'json') return;

    // Get current cursor position
    const position = editor.selection.active;
    this.updateVisualizationFromPosition(editor, position);
  }

  /**
   * Update visualization based on a given position with debouncing and cancellation
   */
  private async updateVisualizationFromPosition(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
    if (!editor || editor.document.languageId !== 'json') return;

    // Cancel any existing operations
    this.cancelCurrentOperations();

    // Debounce the update to avoid excessive processing during rapid changes
    this.debounceTimer = setTimeout(async () => {
      try {
        // Check if we're in a command
        const commandCheck = isPositionInCommand(editor.document, position);
        if (!commandCheck.isCommand || !commandCheck.commandObject) {
          this.currentCommand = undefined;
          this.showEmptyState();
          return;
        }

        // We're in a command definition, store the command
        const command = commandCheck.commandObject;
        this.currentCommand = command;

        // If view exists, update it with cancellation token
        if (this._view) {
          // Create new cancellation token for this operation
          this.currentCancellationTokenSource = new vscode.CancellationTokenSource();
          await this.updateVisualizationPanel(command, this.currentCancellationTokenSource.token);
        }
      } catch (error) {
        // If operation was cancelled, ignore the error
        if (error instanceof vscode.CancellationError) {
          return;
        }
        console.error('Error updating visualization:', error);
      }
    }, 150); // 150ms debounce delay
  }

  /**
   * Update the visualization panel with command data
   */
  private async updateVisualizationPanel(command: any, cancellationToken?: vscode.CancellationToken) {
    if (!this._view) {
      return;
    }

    // Check if operation was cancelled before starting
    if (cancellationToken?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    // Extract signals from the command
    const signals = extractSignals(command);

    // Check cancellation after each potentially expensive operation
    if (cancellationToken?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    // Generate HTML for the bitmap visualization
    const bitmapHtml = generateBitmapHtml(command, signals);

    if (cancellationToken?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    // Get command details for display
    const commandName = command.name || 'Command';
    const commandId = command.id || '';
    const commandHeader = command.hdr || '';
    const commandDisplay = typeof command.cmd === 'object'
      ? Object.entries(command.cmd).map(([k, v]) => `${k}: ${v}`).join(', ')
      : command.cmd?.toString() || '';

    // Use the new generateCommandIdFromDefinition function to create the full command ID
    let fullCommandId = commandId;
    if (!fullCommandId) {
      fullCommandId = generateCommandIdFromDefinition(command);
    }

    if (cancellationToken?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    // Fetch sample responses if we have a command ID - this is the most expensive operation
    const sampleResponses = fullCommandId ? await getSampleCommandResponses(fullCommandId, cancellationToken) : [];

    // Final cancellation check before updating UI
    if (cancellationToken?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    // Update the webview content
    this._view.webview.html = getWebviewContent(
      bitmapHtml,
      commandName,
      commandId,
      commandHeader,
      commandDisplay,
      command.description || '',
      sampleResponses
    );
  }

  /**
   * Manually refresh the visualization (called by command)
   */
  public refresh() {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'json') {
      this.sourceDocument = editor.document;
      this.updateVisualizationFromCursor(editor);
    } else {
      this.showEmptyState();
    }
  }

  /**
   * Dispose of the provider and clean up resources
   */
  public dispose() {
    this.disposables.forEach(d => d.dispose());
    this.cancelCurrentOperations();
    this.sourceDocument = undefined;
    this.currentCommand = undefined;
  }
}
