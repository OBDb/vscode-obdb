import * as vscode from 'vscode';
import { OBDbWorkbenchProvider } from '../obdbWorkbench';

/**
 * Initialize the OBDb visualization provider
 * Shows bitmap visualizations when editing commands in the sidebar
 */
export function initializeVisualizationProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider = new OBDbWorkbenchProvider(context.extensionUri);

  const registration = vscode.window.registerWebviewViewProvider(
    OBDbWorkbenchProvider.viewType,
    provider
  );

  // Register command to manually refresh the workbench
  const refreshCommand = vscode.commands.registerCommand('obdb.showBitmapVisualization', () => {
    provider.refresh();
  });

  return vscode.Disposable.from(registration, provider, refreshCommand);
}