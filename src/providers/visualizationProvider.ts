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

  return vscode.Disposable.from(registration, provider);
}