import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

/**
 * Provider for highlighting signals with suggestedMetric property
 */
export class SuggestedMetricDecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Create decoration type with a light blue background and dashed outline
    this.decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(100, 150, 255, 0.08)',
      border: '1px dashed rgba(100, 150, 255, 0.4)',
      borderRadius: '2px',
      isWholeLine: false,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    // Update decorations when active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'json') {
          this.updateDecorations(editor);
        }
      })
    );

    // Update decorations when document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document && editor.document.languageId === 'json') {
          this.updateDecorations(editor);
        }
      })
    );

    // Update decorations for the current active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'json') {
      this.updateDecorations(activeEditor);
    }
  }

  /**
   * Update decorations for signals with suggestedMetric
   */
  private updateDecorations(editor: vscode.TextEditor): void {
    if (!editor || editor.document.languageId !== 'json') {
      return;
    }

    const document = editor.document;
    const text = document.getText();
    const decorations: vscode.DecorationOptions[] = [];

    try {
      const rootNode = jsonc.parseTree(text);
      if (!rootNode) {
        editor.setDecorations(this.decorationType, []);
        return;
      }

      // Find all commands
      const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
      if (commandsNode && commandsNode.type === 'array' && commandsNode.children) {
        for (const commandNode of commandsNode.children) {
          // Find signals array in each command
          const signalsNode = jsonc.findNodeAtLocation(commandNode, ['signals']);
          if (signalsNode && signalsNode.type === 'array' && signalsNode.children) {
            for (const signalNode of signalsNode.children) {
              // Check if signal has suggestedMetric property
              const suggestedMetricNode = jsonc.findNodeAtLocation(signalNode, ['suggestedMetric']);
              if (suggestedMetricNode && signalNode.offset !== undefined && signalNode.length !== undefined) {
                // Highlight the entire signal object
                const startPos = document.positionAt(signalNode.offset);
                const endPos = document.positionAt(signalNode.offset + signalNode.length);
                const range = new vscode.Range(startPos, endPos);

                // Get the suggestedMetric value for the hover message
                const suggestedMetricValue = jsonc.getNodeValue(suggestedMetricNode);
                const signalIdNode = jsonc.findNodeAtLocation(signalNode, ['id']);
                const signalId = signalIdNode ? jsonc.getNodeValue(signalIdNode) : 'Unknown';

                decorations.push({
                  range,
                  hoverMessage: `**Connectable Signal**\n\nSignal \`${signalId}\` has suggested metric: \`${suggestedMetricValue}\``
                });
              }
            }
          }
        }
      }

      editor.setDecorations(this.decorationType, decorations);
    } catch (error) {
      console.error('Error updating suggestedMetric decorations:', error);
      editor.setDecorations(this.decorationType, []);
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.decorationType.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
