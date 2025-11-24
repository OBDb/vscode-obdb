import * as jsonc from 'jsonc-parser';
import { ILinterRule, LinterRuleConfig, LintResult, LintSeverity, Signal } from './rule';

/**
 * Rule that flags signal names containing bracketed content like [ABS] or (ECM).
 * Such content should typically be in the path property or signal ID, not the display name.
 */
export class BracketedContentInSignalNameRule implements ILinterRule {
  private config: LinterRuleConfig = {
    id: 'bracketed-content-in-signal-name',
    name: 'Bracketed Content in Signal Name',
    description: 'Signal names should not contain bracketed content like [ABS] or (ECM). Use the path property to organize signals instead.',
    severity: LintSeverity.Warning,
    enabled: true,
  };

  getConfig(): LinterRuleConfig {
    return this.config;
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    const signalName = signal.name;
    const nameNode = jsonc.findNodeAtLocation(node, ['name']);

    if (!nameNode || !signalName) {
      return null;
    }

    // Check for square brackets [...]
    const squareBracketMatch = signalName.match(/\[([^\]]+)\]/);
    if (squareBracketMatch) {
      const bracketedContent = squareBracketMatch[0];

      // Create suggested name by removing the bracketed content
      const suggestedName = this.removeBracketedContent(signalName, squareBracketMatch);

      return {
        ruleId: this.config.id,
        message: `Signal name '${signalName}' contains bracketed content '${bracketedContent}'. Use the path property to organize signals instead.`,
        node: nameNode,
        suggestion: {
          title: `Remove bracketed content '${bracketedContent}'`,
          edits: [{
            newText: `"${suggestedName}"`,
            offset: nameNode.offset,
            length: nameNode.length
          }]
        }
      };
    }

    // Check for parentheses (...)
    const parenMatch = signalName.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const bracketedContent = parenMatch[0];

      // Create suggested name by removing the bracketed content
      const suggestedName = this.removeBracketedContent(signalName, parenMatch);

      return {
        ruleId: this.config.id,
        message: `Signal name '${signalName}' contains bracketed content '${bracketedContent}'. Use the path property to organize signals instead.`,
        node: nameNode,
        suggestion: {
          title: `Remove bracketed content '${bracketedContent}'`,
          edits: [{
            newText: `"${suggestedName}"`,
            offset: nameNode.offset,
            length: nameNode.length
          }]
        }
      };
    }

    return null;
  }

  /**
   * Removes bracketed content from a signal name and cleans up extra whitespace
   * @param name The original signal name
   * @param match The regex match result
   * @returns The cleaned signal name
   */
  private removeBracketedContent(name: string, match: RegExpMatchArray): string {
    const bracketedContent = match[0];
    let result = name.replace(bracketedContent, '');

    // Clean up extra whitespace
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }
}
