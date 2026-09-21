/**
 * VSCode-specific adapter for linting
 * 
 * This file handles all VSCode-specific conversions:
 * - LintResult → vscode.Diagnostic
 * - LintSeverity → vscode.DiagnosticSeverity
 * 
 * The core linting logic (in rules/ and signalLinter.ts) is vscode-agnostic
 * and can be used by both the VSCode plugin and CLI tools.
 */

import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { LintResult, LintSeverity } from './rules/rule';

/**
 * Maps LintSeverity enum to VSCode DiagnosticSeverity
 */
export function mapToVscodeSeverity(severity: LintSeverity): vscode.DiagnosticSeverity {
  switch (severity) {
    case LintSeverity.Error:
      return vscode.DiagnosticSeverity.Error;
    case LintSeverity.Warning:
      return vscode.DiagnosticSeverity.Warning;
    case LintSeverity.Information:
      return vscode.DiagnosticSeverity.Information;
    case LintSeverity.Hint:
      return vscode.DiagnosticSeverity.Hint;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

/**
 * Converts linting results to VSCode diagnostics
 */
export function convertToVscodeDiagnostics(
  document: vscode.TextDocument,
  results: LintResult[],
  getRuleSeverity: (ruleId: string) => LintSeverity
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  for (const result of results) {
    const severity = getRuleSeverity(result.ruleId);
    const vscodeSeverity = mapToVscodeSeverity(severity);

    // Get position information from the JSONC node
    const startPos = document.positionAt(result.node.offset);
    const endPos = document.positionAt(result.node.offset + result.node.length);
    const range = new vscode.Range(startPos, endPos);

    const diagnostic = new vscode.Diagnostic(range, result.message, vscodeSeverity);
    diagnostic.code = result.ruleId;
    diagnostic.source = 'obdb-signal-linter';

    diagnostics.push(diagnostic);
  }

  return diagnostics;
}
