import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

/**
 * Interface for a signal object in the JSON
 */
export interface Signal {
  id: string;
  path: string;
  fmt: {
    unit?: string;
    [key: string]: any;
  };
  name: string;
  suggestedMetric?: string;
  description?: string;
}

/**
 * Interface for a signal group object (simplified for ID checking)
 */
export interface SignalGroup {
  id: string;
  // Potentially other properties if other rules need to check signal groups
}

/**
 * Interface for a command object in the JSON.
 * This is a basic representation; specific command structures might vary.
 */
export interface Command {
  id: string; // Or another unique identifier for the command
  // Other command-specific properties can be accessed via commandNode if needed
  [key: string]: any; // Allow other properties
}

/**
 * Contextual information about the document being linted.
 */
export interface DocumentContext {
  /**
   * A map of all unique IDs (from signals and signal groups) found in the document
   * to their first encountered jsonc.Node (the object node, not the ID property node).
   */
  allIds: Map<string, jsonc.Node>;
}

/**
 * Interface for linter rule validation results
 */
export interface LintResult {
  ruleId: string;
  message: string;
  node: jsonc.Node;
  suggestion?: {
    title: string;
    edits: {
      newText: string;
      offset: number;
      length: number;
    }[];
  };
}

/**
 * Severity levels for linter rules
 */
export enum LintSeverity {
  Error = 'error',
  Warning = 'warning',
  Information = 'information',
  Hint = 'hint'
}

/**
 * Maps severity levels to VS Code diagnostic severity
 */
export function getSeverity(severity: LintSeverity): vscode.DiagnosticSeverity {
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
 * Interface for linter rule configuration
 */
export interface LinterRuleConfig {
  id: string;
  name: string;
  description: string;
  severity: LintSeverity;
  enabled: boolean;
}

/**
 * Base interface for all linter rules
 */
export interface ILinterRule {
  /**
   * Gets the rule configuration
   */
  getConfig(): LinterRuleConfig;

  /**
   * Validates an individual signal or signal group against this rule.
   * @param target The signal or signal group to validate
   * @param node The JSONC node for the target
   * @param context Document-wide context
   * @returns Lint result(s) or null if no issues are found
   */
  validateSignal?(target: Signal | SignalGroup, node: jsonc.Node, context: DocumentContext): LintResult | null | LintResult[];

  /**
   * Validates a command and its signals against this rule.
   * @param command The parsed command object
   * @param commandNode The JSONC node for the command
   * @param signalsInCommand An array of signals belonging to this command, with their respective nodes
   * @param context Document-wide context
   * @returns Lint result(s) or null if no issues are found
   */
  validateCommand?(command: Command, commandNode: jsonc.Node, signalsInCommand: { signal: Signal, node: jsonc.Node }[], context: DocumentContext): LintResult | null | LintResult[];
}