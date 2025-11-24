import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that checks that signal IDs use consistent naming conventions
 */
export class SignalNamingConventionRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'signal-naming-convention',
      name: 'Signal Naming Convention',
      description: 'Signal IDs should use consistent naming conventions',
      severity: LintSeverity.Error,
      enabled: true,
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    // Get the id property node
    const idNode = jsonc.findNodeAtLocation(node, ['id']);
    if (!idNode) return null;

    // Check for trailing underscore
    if (signal.id.endsWith('_')) {
      const suggestedId = signal.id.replace(/_+$/, '');

      return {
        ruleId: this.getConfig().id,
        message: `Signal ID should not end with underscore. Found: "${signal.id}"`,
        node: idNode,
        suggestion: {
          title: `Remove trailing underscore: "${suggestedId}"`,
          edits: [{
            newText: `"${suggestedId}"`,
            offset: idNode.offset,
            length: idNode.length
          }]
        }
      };
    }

    // Check that IDs use all caps with underscores
    const isValidFormat = /^[A-Z0-9_]+$/.test(signal.id);
    if (!isValidFormat) {
      // Generate a suggested fix - convert to uppercase and replace spaces with underscores
      const suggestedId = signal.id
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/[^A-Z0-9_]/g, '_');

      return {
        ruleId: this.getConfig().id,
        message: `Signal IDs should use all uppercase letters, numbers, and underscores (SNAKE_CASE). Found: "${signal.id}"`,
        node: idNode,
        suggestion: {
          title: `Convert to SNAKE_CASE: "${suggestedId}"`,
          edits: [{
            newText: `"${suggestedId}"`,
            offset: idNode.offset,
            length: idNode.length
          }]
        }
      };
    }

    return null;
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validate(signal: Signal, node: jsonc.Node): LintResult | null {
    return this.validateSignal(signal, node);
  }
}