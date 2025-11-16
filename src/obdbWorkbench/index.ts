/**
 * OBDb Workbench module
 * Provides functionality for visualizing bitmap data in commands
 */

// Re-export the main provider
export { OBDbWorkbenchProvider } from './provider';

// Export other useful components for external use
export { getWebviewContent } from './webviewContent';
export { extractSignals, createBitToSignalMap, generateSignalColors, getUniqueSignals } from './signalExtractor';
export { generateBitmapHtml } from './htmlGenerator';
export { escapeHtml, formatBitRange } from './utils';