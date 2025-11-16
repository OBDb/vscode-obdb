import * as vscode from 'vscode';
import { isPositionInCommand, getSampleCommandResponses, generateCommandIdFromDefinition } from '../utils/commandParser';
import { extractSignals, getUniqueSignals, generateSignalColors } from './signalExtractor';
import { generateBitmapHtml } from './htmlGenerator';
import { getWebviewContent } from './webviewContent';
import { Signal } from '../types';

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

    // If we have a source document, show signal summary
    if (this.sourceDocument && this.sourceDocument.languageId === 'json') {
      this._view.webview.html = this.getSignalSummaryHtml(this.sourceDocument);
    } else {
      this._view.webview.html = this.getEmptyStateHtml();
    }
  }

  /**
   * Extract all signals from a JSON document
   */
  private extractAllSignals(document: vscode.TextDocument): Signal[] {
    try {
      const content = document.getText();
      let jsonDoc;

      try {
        jsonDoc = JSON.parse(content);
      } catch (err) {
        return [];
      }

      const allSignals: Signal[] = [];

      // Helper function to add signals from a command
      const addSignalsFromCommand = (command: any) => {
        const signals = extractSignals(command);
        allSignals.push(...signals);
      };

      // Check if document has commands array
      if (jsonDoc.commands && Array.isArray(jsonDoc.commands)) {
        jsonDoc.commands.forEach((command: any) => {
          addSignalsFromCommand(command);
        });
      } else if ((jsonDoc.parameters && Array.isArray(jsonDoc.parameters)) ||
                 (jsonDoc.signals && Array.isArray(jsonDoc.signals))) {
        // Single command document
        addSignalsFromCommand(jsonDoc);
      }

      return allSignals;
    } catch (error) {
      console.error('Error extracting signals:', error);
      return [];
    }
  }

  /**
   * Group signals by their path property
   */
  private groupSignalsByPath(signals: Signal[]): { path: string; signals: Signal[] }[] {
    const signalsByPathMap = new Map<string, Signal[]>();

    signals.forEach(signal => {
      const path = signal.path || '(uncategorized)';
      if (!signalsByPathMap.has(path)) {
        signalsByPathMap.set(path, []);
      }
      signalsByPathMap.get(path)!.push(signal);
    });

    // Convert map to sorted array
    const signalsByPath: { path: string; signals: Signal[] }[] = [];
    const sortedPaths = Array.from(signalsByPathMap.keys()).sort((a, b) => {
      // Put uncategorized at the end
      if (a === '(uncategorized)') return 1;
      if (b === '(uncategorized)') return -1;
      return a.localeCompare(b);
    });

    sortedPaths.forEach(path => {
      signalsByPath.push({
        path,
        signals: signalsByPathMap.get(path)!
      });
    });

    return signalsByPath;
  }

  /**
   * Group signals by their suggestedMetric (Connectable)
   */
  private groupSignalsByConnectable(signals: Signal[]): { connectable: string; signals: Signal[] }[] {
    const signalsByConnectableMap = new Map<string, Signal[]>();

    signals.forEach(signal => {
      if (signal.suggestedMetric) {
        if (!signalsByConnectableMap.has(signal.suggestedMetric)) {
          signalsByConnectableMap.set(signal.suggestedMetric, []);
        }
        signalsByConnectableMap.get(signal.suggestedMetric)!.push(signal);
      }
    });

    // Convert map to sorted array
    const signalsByConnectable: { connectable: string; signals: Signal[] }[] = [];
    const sortedConnectables = Array.from(signalsByConnectableMap.keys()).sort();

    sortedConnectables.forEach(connectable => {
      signalsByConnectable.push({
        connectable,
        signals: signalsByConnectableMap.get(connectable)!
      });
    });

    return signalsByConnectable;
  }

  /**
   * Generate HTML for signal summary view
   */
  private getSignalSummaryHtml(document: vscode.TextDocument): string {
    const allSignals = this.extractAllSignals(document);

    if (allSignals.length === 0) {
      return this.getEmptyStateHtml();
    }

    const signalsByConnectable = this.groupSignalsByConnectable(allSignals);
    const signalsByPath = this.groupSignalsByPath(allSignals);
    const totalPaths = signalsByPath.length;

    // Generate Connectables section
    let connectablesHtml = '';
    if (signalsByConnectable.length > 0) {
      signalsByConnectable.forEach(({ connectable, signals }) => {
        const uniqueSignals = getUniqueSignals(signals);
        const signalColors = generateSignalColors(uniqueSignals);

        connectablesHtml += `
          <div class="group-section">
            <h3 class="group-name">${this.escapeHtml(connectable)}</h3>
            <div class="signal-count">${uniqueSignals.length} signal${uniqueSignals.length !== 1 ? 's' : ''}</div>
            <div class="signal-list">
              ${uniqueSignals.map(signal => `
                <div class="signal-item">
                  <div class="signal-color" style="background-color: ${signalColors[signal.id]}"></div>
                  <div class="signal-info">
                    <div class="signal-name">${this.escapeHtml(signal.name)}</div>
                    <div class="signal-details">
                      ${signal.id} • ${signal.bitLength} bit${signal.bitLength !== 1 ? 's' : ''} @ offset ${signal.bitOffset}
                      ${signal.path ? ` • ${this.escapeHtml(signal.path)}` : ''}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });
    }

    // Generate signals by path section
    let pathsHtml = '';
    signalsByPath.forEach(({ path, signals }) => {
      const uniqueSignals = getUniqueSignals(signals);
      const signalColors = generateSignalColors(uniqueSignals);

      pathsHtml += `
        <div class="group-section">
          <h3 class="group-name">${this.escapeHtml(path)}</h3>
          <div class="signal-count">${uniqueSignals.length} signal${uniqueSignals.length !== 1 ? 's' : ''}</div>
          <div class="signal-list">
            ${uniqueSignals.map(signal => `
              <div class="signal-item">
                <div class="signal-color" style="background-color: ${signalColors[signal.id]}"></div>
                <div class="signal-info">
                  <div class="signal-name">${this.escapeHtml(signal.name)}</div>
                  <div class="signal-details">
                    ${signal.id} • ${signal.bitLength} bit${signal.bitLength !== 1 ? 's' : ''} @ offset ${signal.bitOffset}
                    ${signal.suggestedMetric ? ` • ${this.escapeHtml(signal.suggestedMetric)}` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      padding: 0;
      margin: 0;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .section-header {
      padding: 16px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-widget-border);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .section-header h2 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
    }
    .section-header .count {
      font-size: 12px;
      opacity: 0.7;
    }
    .divider {
      height: 8px;
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-widget-border);
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .group-section {
      padding: 16px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .group-section:last-child {
      border-bottom: none;
    }
    .group-name {
      margin: 0 0 4px 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .signal-count {
      font-size: 12px;
      opacity: 0.6;
      margin-bottom: 12px;
    }
    .signal-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .signal-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 8px;
      background: var(--vscode-list-hoverBackground);
      border-radius: 4px;
    }
    .signal-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .signal-info {
      flex: 1;
      min-width: 0;
    }
    .signal-name {
      font-weight: 500;
      margin-bottom: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .signal-details {
      font-size: 11px;
      opacity: 0.7;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  ${connectablesHtml ? `
    <div class="section-header">
      <h2>Connectables</h2>
      <div class="count">${signalsByConnectable.length} connectable${signalsByConnectable.length !== 1 ? 's' : ''}</div>
    </div>
    ${connectablesHtml}
    <div class="divider"></div>
  ` : ''}
  <div class="section-header">
    <h2>Signals by Path</h2>
    <div class="count">${allSignals.length} signal${allSignals.length !== 1 ? 's' : ''} • ${totalPaths} path${totalPaths !== 1 ? 's' : ''}</div>
  </div>
  ${pathsHtml}
</body>
</html>`;
  }

  /**
   * Generate HTML for empty state (no JSON file open)
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
    <h2>No Signalset Open</h2>
    <p>Open a JSON signalset file to view signal summaries and command visualizations.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
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
   * Check if cursor is directly on a "path" property (key or value) in the JSON
   */
  private isCursorOnPathProperty(editor: vscode.TextEditor, position: vscode.Position): boolean {
    const line = editor.document.lineAt(position.line);
    const lineText = line.text;

    // Find the "path" property pattern on this line
    const pathPropertyRegex = /"path"\s*:\s*"[^"]*"/g;
    let match;

    while ((match = pathPropertyRegex.exec(lineText)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;

      // Get the character position in the line
      const cursorChar = position.character;

      // Check if cursor is within the "path" property (including quotes and value)
      if (cursorChar >= matchStart && cursorChar <= matchEnd) {
        return true;
      }
    }

    return false;
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
        // Check if cursor is on a "path" property - if so, show signal summary
        if (this.isCursorOnPathProperty(editor, position)) {
          this.currentCommand = undefined;
          this.showEmptyState();
          return;
        }

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
