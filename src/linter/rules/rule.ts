import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

/**
 * Interface for a signal object in the JSON
 */
export interface Signal {
  id: string;
  path: string;
  fmt: {
    len?: number;
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
   * @returns Lint result(s) or null if no issues are found
   */
  validateSignal?(target: Signal | SignalGroup, node: jsonc.Node): LintResult | null | LintResult[];

  /**
   * Validates a command and its signals against this rule.
   * @param command The parsed command object
   * @param commandNode The JSONC node for the command
   * @param signalsInCommand An array of signals belonging to this command, with their respective nodes
   * @returns Lint result(s) or null if no issues are found
   */
  validateCommand?(command: Command, commandNode: jsonc.Node, signalsInCommand: { signal: Signal, node: jsonc.Node }[]): LintResult | null | LintResult[];

  /**
   * Validates all commands in a command array against this rule.
   * @param commandsNode The JSONC node for the commands array
   * @returns Lint result(s) or null if no issues are found
   */
  validateCommands?(commandsNode: jsonc.Node): LintResult[] | null;

  /**
   * Validates the entire document at once. Use this for rules that need to process the entire
   * document or need to track relationships between different parts of the document.
   * @param rootNode The root JSONC node for the entire document
   * @returns Lint result(s) or null if no issues are found
   */
  validateDocument?(rootNode: jsonc.Node): LintResult[] | null;
}