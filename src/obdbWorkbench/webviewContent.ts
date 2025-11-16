import { escapeHtml } from './utils';

/**
 * Generate webview HTML content
 */
export function getWebviewContent(
  bitmapHtml: string,
  commandName: string,
  commandId: string,
  commandHeader: string,
  commandDisplay: string,
  description: string,
  sampleResponses?: Array<{modelYear: string, response: string, expectedValues?: Record<string, any>}>,
  highlightedSignalId?: string | null
): string {
  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>OBDb workbench</title>' +
    '<style>' +
    'body {' +
    'padding: 16px;' +
    'color: var(--vscode-foreground);' +
    'font-family: var(--vscode-font-family);' +
    'background-color: var(--vscode-editor-background);' +
    'line-height: 1.5;' +
    '}' +
    '.header {' +
    'margin-bottom: 16px;' +
    'border-bottom: 1px solid var(--vscode-panel-border);' +
    'padding-bottom: 10px;' +
    '}' +
    'h2 {' +
    'margin-top: 0;' +
    'margin-bottom: 8px;' +
    'font-size: 1.3em;' +
    'font-weight: 600;' +
    'color: var(--vscode-editor-foreground);' +
    '}' +
    'h3 {' +
    'margin-top: 0;' +
    'margin-bottom: 12px;' +
    'font-size: 1.1em;' +
    'font-weight: 600;' +
    '}' +
    '.details {' +
    'margin-bottom: 16px;' +
    'font-size: 0.9em;' +
    '}' +
    '.detail-label {' +
    'font-weight: bold;' +
    'display: inline-block;' +
    'min-width: 70px;' +
    '}' +
    '.description {' +
    'margin-bottom: 20px;' +
    'font-style: italic;' +
    '}' +
    '.no-signals {' +
    'color: var(--vscode-descriptionForeground);' +
    'font-style: italic;' +
    'margin: 8px 0;' +
    '}' +
    '.error {' +
    'color: var(--vscode-errorForeground);' +
    'margin: 16px 0;' +
    '}' +
    '.bitmap-container {' +
    'display: flex;' +
    'flex-direction: column;' +
    'gap: 20px;' +
    'margin-top: 16px;' +
    '}' +
    '.bit-grid table {' +
    'border-collapse: separate;' +
    'border-spacing: 2px;' +
    'margin: 0 auto;' +
    '}' +
    '.bit-grid th {' +
    'padding: 5px;' +
    'text-align: center;' +
    'font-weight: 600;' +
    'background-color: var(--vscode-editor-background);' +
    'color: var(--vscode-descriptionForeground);' +
    'font-size: 0.9em;' +
    '}' +
    '.bit-grid td {' +
    'width: 32px;' +
    'height: 32px;' +
    'text-align: center;' +
    'vertical-align: middle;' +
    'font-family: var(--vscode-editor-font-family), monospace;' +
    'font-size: 0.8em;' +
    'border-radius: 4px;' +
    'border: 1px solid var(--vscode-panel-border);' +
    'background-color: var(--vscode-input-background);' +
    '}' +
    '.bit-grid td.signal-bit {' +
    'font-weight: bold;' +
    'cursor: pointer;' +
    '}' +
    '.bit-grid td.signal-bit:hover {' +
    'transform: scale(1.05);' +
    'box-shadow: 0 0 4px var(--vscode-focusBorder);' +
    'transition: all 0.2s ease;' +
    '}' +
    '.index-format-toggle {' +
    'margin-bottom: 16px;' +
    'display: flex;' +
    'align-items: center;' +
    'gap: 12px;' +
    '}' +
    '.toggle-label {' +
    'font-weight: 500;' +
    '}' +
    '.toggle-switch {' +
    'display: flex;' +
    'background-color: var(--vscode-editor-background);' +
    'border: 1px solid var(--vscode-panel-border);' +
    'border-radius: 4px;' +
    'overflow: hidden;' +
    '}' +
    '.toggle-switch input[type="radio"] {' +
    'display: none;' +
    '}' +
    '.toggle-switch label {' +
    'padding: 6px 12px;' +
    'cursor: pointer;' +
    'transition: background-color 0.3s;' +
    'user-select: none;' +
    '}' +
    '.toggle-switch input[type="radio"]:checked + label {' +
    'background-color: var(--vscode-button-background);' +
    'color: var(--vscode-button-foreground);' +
    '}' +
    '.toggle-switch label:hover:not(:has(+ input[type="radio"]:checked)) {' +
    'background-color: var(--vscode-list-hoverBackground);' +
    '}' +
    '.signal-legend {' +
    'border-top: 1px solid var(--vscode-panel-border);' +
    'padding-top: 16px;' +
    'margin-top: 8px;' +
    '}' +
    '.legend-items {' +
    'display: flex;' +
    'flex-direction: column;' +
    'gap: 8px;' +
    '}' +
    '.legend-item {' +
    'display: flex;' +
    'align-items: center;' +
    'padding: 6px;' +
    'border-radius: 4px;' +
    'cursor: pointer;' +
    '}' +
    '.legend-item:hover {' +
    'background-color: var(--vscode-list-hoverBackground);' +
    '}' +
    '.color-box {' +
    'width: 16px;' +
    'height: 16px;' +
    'margin-right: 8px;' +
    'border-radius: 3px;' +
    'border: 1px solid var(--vscode-panel-border);' +
    '}' +
    '.signal-info {' +
    'display: flex;' +
    'flex-wrap: wrap;' +
    'align-items: center;' +
    'gap: 8px;' +
    '}' +
    '.signal-name {' +
    'font-weight: 500;' +
    '}' +
    '.signal-bits {' +
    'color: var(--vscode-descriptionForeground);' +
    'font-size: 0.9em;' +
    '}' +
    '.signal-formula {' +
    'color: var(--vscode-descriptionForeground);' +
    'font-size: 0.9em;' +
    'margin-top: 4px;' +
    '}' +
    '.formula-range {' +
    'display: inline-block;' +
    'margin-top: 4px;' +
    'padding: 2px 6px;' +
    'background-color: var(--vscode-editorInlayHint-background);' +
    'border-radius: 3px;' +
    'font-size: 0.85em;' +
    'color: var(--vscode-editorInlayHint-foreground);' +
    '}' +
    '.metric-tag {' +
    'background-color: var(--vscode-badge-background, #4070f4);' +
    'color: var(--vscode-badge-foreground, white);' +
    'padding: 2px 6px;' +
    'border-radius: 10px;' +
    'font-size: 0.8em;' +
    'margin-left: auto;' +
    '}' +
    '.samples-container {' +
    'margin-top: 30px;' +
    'border-top: 1px solid var(--vscode-panel-border);' +
    'padding-top: 16px;' +
    '}' +
    '.sample-response {' +
    'margin-bottom: 12px;' +
    'background-color: var(--vscode-editor-background);' +
    'border: 1px solid var(--vscode-panel-border);' +
    'border-radius: 4px;' +
    'padding: 10px;' +
    '}' +
    '.sample-heading {' +
    'font-weight: 500;' +
    'margin-bottom: 6px;' +
    'color: var(--vscode-editor-foreground);' +
    'display: flex;' +
    'justify-content: space-between;' +
    'align-items: center;' +
    '}' +
    '.copy-button {' +
    'background-color: var(--vscode-button-secondaryBackground);' +
    'color: var(--vscode-button-secondaryForeground);' +
    'border: none;' +
    'border-radius: 3px;' +
    'padding: 3px 8px;' +
    'font-size: 0.8em;' +
    'cursor: pointer;' +
    'display: flex;' +
    'align-items: center;' +
    'gap: 4px;' +
    '}' +
    '.copy-button:hover {' +
    'background-color: var(--vscode-button-secondaryHoverBackground);' +
    '}' +
    '.sample-response-data {' +
    'font-family: var(--vscode-editor-font-family), monospace;' +
    'background-color: var(--vscode-textCodeBlock-background);' +
    'padding: 6px;' +
    'border-radius: 3px;' +
    'font-size: 0.9em;' +
    'overflow-wrap: break-word;' +
    'white-space: pre;' +
    '}' +
    '.expected-values {' +
    'margin-top: 8px;' +
    'font-size: 0.9em;' +
    'color: var(--vscode-descriptionForeground);' +
    '}' +
    '.expected-value {' +
    'display: inline-block;' +
    'margin-right: 10px;' +
    'margin-bottom: 5px;' +
    'padding: 2px 6px;' +
    'background-color: var(--vscode-editorInlayHint-background);' +
    'border-radius: 3px;' +
    '}' +
    '.no-samples {' +
    'color: var(--vscode-descriptionForeground);' +
    'font-style: italic;' +
    '}' +
    '@media (min-width: 768px) {' +
    '.bitmap-container {' +
    'flex-direction: row;' +
    'align-items: flex-start;' +
    '}' +
    '.signal-legend {' +
    'border-top: none;' +
    'border-left: 1px solid var(--vscode-panel-border);' +
    'padding-top: 0;' +
    'padding-left: 20px;' +
    'margin-top: 0;' +
    'min-width: 250px;' +
    'max-width: 300px;' +
    '}' +
    '}' +
    '.highlight {' +
    'box-shadow: 0 0 0 2px var(--vscode-focusBorder);' +
    'transform: scale(1.05);' +
    'z-index: 10;' +
    'transition: all 0.2s ease;' +
    '}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="header">' +
    '<h2>' + escapeHtml(commandName) + '</h2>' +
    '</div>' +
    '<div class="details">' +
    (commandId ? '<div><span class="detail-label">ID:</span> ' + escapeHtml(commandId) + '</div>' : '') +
    (commandHeader ? '<div><span class="detail-label">Header:</span> ' + escapeHtml(commandHeader) + '</div>' : '') +
    (commandDisplay ? '<div><span class="detail-label">Command:</span> ' + escapeHtml(commandDisplay) + '</div>' : '') +
    '</div>' +
    (description ? '<div class="description">' + escapeHtml(description) + '</div>' : '') +
    bitmapHtml +
    // Add sample responses section if available
    (sampleResponses && sampleResponses.length > 0 ?
      '<div class="samples-container">' +
      '<h3>Sample Responses by Model Year</h3>' +
      sampleResponses.map(sample =>
        '<div class="sample-response">' +
        '<div class="sample-heading">' +
        '<span>Model Year ' + escapeHtml(sample.modelYear) + '</span>' +
        '<button class="copy-button" onclick="copyToClipboard(this, `' + escapeHtml(sample.response.replace(/`/g, '\\`')) + '`)">'+
        '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">'+
        '<path d="M4 4h8v1H4V4zm0 3h8v1H4V7zm0 3h6v1H4v-1z"/>'+
        '<path fill-rule="evenodd" clip-rule="evenodd" d="M3 1L2 2v12l1 1h10l1-1V2l-1-1H3zm0 1h10v12H3V2z"/>'+
        '</svg> Copy</button>' +
        '</div>' +
        '<div class="sample-response-data">' + escapeHtml(sample.response) + '</div>' +
        (sample.expectedValues ?
          '<div class="expected-values">' +
          '<div>Expected Values:</div>' +
          Object.entries(sample.expectedValues).map(([key, value]) =>
            '<span class="expected-value">' + escapeHtml(key) + ': ' + escapeHtml(String(value)) + '</span>'
          ).join('') +
          '</div>'
        : '') +
        '</div>'
      ).join('') +
      '</div>'
    : '') +
    '<script>' +
    'document.addEventListener("DOMContentLoaded", () => {' +
    'const signalBitCells = document.querySelectorAll(".signal-bit");' +
    'const legendItems = document.querySelectorAll(".legend-item");' +
    'const numericRadio = document.getElementById("numeric-format");' +
    'const alphabeticRadio = document.getElementById("alphabetic-format");' +

    // Try to load saved format preference
    'const savedFormat = sessionStorage.getItem("obdb-index-format") || "numeric";' +

    // Set the radio button based on saved preference
    'if (savedFormat === "alphabetic" && alphabeticRadio) {' +
    '  alphabeticRadio.checked = true;' +
    '} else if (numericRadio) {' +
    '  numericRadio.checked = true;' +
    '}' +

    'if (numericRadio && alphabeticRadio) {' +
    'numericRadio.addEventListener("change", () => {' +
    'if (numericRadio.checked) {' +
    '  updateIndexFormat("numeric");' +
    '  sessionStorage.setItem("obdb-index-format", "numeric");' +
    '}' +
    '});' +
    'alphabeticRadio.addEventListener("change", () => {' +
    'if (alphabeticRadio.checked) {' +
    '  updateIndexFormat("alphabetic");' +
    '  sessionStorage.setItem("obdb-index-format", "alphabetic");' +
    '}' +
    '});' +

    // Apply the currently selected format on page load
    'updateIndexFormat(savedFormat);' +
    '}' +
    'function updateIndexFormat(format) {' +
    'const byteIndexElements = document.querySelectorAll(".byte-index");' +
    'byteIndexElements.forEach(element => {' +
    'element.textContent = element.getAttribute("data-" + format);' +
    '});' +

    // Update bit column headers
    'const bitHeaders = document.querySelectorAll(".bit-header");' +
    'bitHeaders.forEach(header => {' +
    'header.textContent = header.getAttribute("data-" + format);' +
    '});' +

    // Update bit cells based on format
    'const bitCells = document.querySelectorAll(".bit-cell");' +
    'if (format === "numeric") {' +
    'bitCells.forEach(cell => {' +
    'cell.textContent = cell.getAttribute("data-numeric");' +
    '});' +
    '} else if (format === "alphabetic") {' +
    // When using alphabetic format, show bit values (1, 2, 4, 8, etc.) in reverse order
    'bitCells.forEach(cell => {' +
    'const bitIndex = 7 - parseInt(cell.getAttribute("data-numeric") % 8);' +
    'const bitValue = Math.pow(2, bitIndex);' +
    'cell.textContent = bitValue;' +
    '});' +
    '}' +
    '}' +
    'signalBitCells.forEach(cell => {' +
    'cell.addEventListener("mouseenter", () => {' +
    'const signalId = cell.getAttribute("data-signal-id");' +
    'highlightSignal(signalId);' +
    '});' +
    'cell.addEventListener("mouseleave", () => {' +
    'clearHighlights();' +
    '});' +
    '});' +
    'legendItems.forEach(item => {' +
    'item.addEventListener("mouseenter", () => {' +
    'const signalId = item.getAttribute("data-signal-id");' +
    'highlightSignal(signalId);' +
    '});' +
    'item.addEventListener("mouseleave", () => {' +
    'clearHighlights();' +
    '});' +
    '});' +
    'function highlightSignal(signalId) {' +
    'document.querySelectorAll(".signal-bit[data-signal-id=\'" + signalId + "\']").forEach(el => {' +
    'el.classList.add("highlight");' +
    '});' +
    'document.querySelectorAll(".legend-item[data-signal-id=\'" + signalId + "\']").forEach(el => {' +
    'el.classList.add("highlight");' +
    '});' +
    '}' +
    'function clearHighlights() {' +
    'document.querySelectorAll(".highlight").forEach(el => {' +
    'el.classList.remove("highlight");' +
    '});' +
    '}' +
    // Auto-highlight signal if provided
    (highlightedSignalId ? `highlightSignal('${highlightedSignalId}');` : '') +
    '});' +
    '</script>' +
    '<script>' +
    'function copyToClipboard(button, text) {' +
    '  navigator.clipboard.writeText(text).then(() => {' +
    '    const originalText = button.innerHTML;' +
    '    button.innerHTML = "<svg width=\'14\' height=\'14\' viewBox=\'0 0 16 16\' xmlns=\'http://www.w3.org/2000/svg\' fill=\'currentColor\'><path fill-rule=\'evenodd\' clip-rule=\'evenodd\' d=\'M14.431 3.323l-8.47 8.47L3 9.348l-1.354 1.353 4.315 4.313.707-.707 9.117-9.117-1.354-1.867zM3.707 7.996l1.35 1.354 8.475-8.475-1.354-1.35-8.475 8.475z\'/></svg> Copied!";' +
    '    button.style.backgroundColor = "var(--vscode-button-background)";' +
    '    button.style.color = "var(--vscode-button-foreground)";' +
    '    setTimeout(() => {' +
    '      button.innerHTML = originalText;' +
    '      button.style.backgroundColor = "";' +
    '      button.style.color = "";' +
    '    }, 2000);' +
    '  }).catch(err => {' +
    '    console.error("Failed to copy text: ", err);' +
    '  });' +
    '}' +
    '</script>' +
    '</body>' +
    '</html>';
}