import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that suggests a signal path based on the signal's ID
 * Provides intelligent path suggestions based on patterns in the signal ID
 */
export class SignalPathSuggestionRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'signal-path-suggestion',
      name: 'Signal Path Suggestion',
      description: 'Suggests appropriate signal paths based on the signal ID patterns',
      severity: LintSeverity.Information,
      enabled: true,
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    // Get the path node to target in diagnostic
    const pathNode = jsonc.findNodeAtLocation(node, ['path']);
    if (!pathNode) return null;

    const signalId = signal.id;
    const currentPath = signal.path;

    // Find the suggested path based on ID patterns
    const suggestedPath = this.getSuggestedPath(signalId);

    // If we found a suggestion and it's different from the current path
    if (suggestedPath && !currentPath.startsWith(suggestedPath)) {  // Allow subpaths
      return {
        ruleId: this.getConfig().id,
        message: `Signal ID "${signalId}" suggests it should be in path "${suggestedPath}" instead of "${currentPath}"`,
        node: pathNode,
        suggestion: {
          title: `Change path to "${suggestedPath}"`,
          edits: [{
            offset: pathNode.offset,
            length: pathNode.length,
            newText: `"${suggestedPath}"`
          }]
        }
      };
    }

    return null;
  }

  /**
   * Gets a suggested path based on signal ID patterns
   * @param signalId The signal ID to analyze
   * @returns Suggested path or undefined if no match
   */
  private getSuggestedPath(signalId: string): string | undefined {
    // Pattern mappings from ID keywords to paths
    // Order matters: more specific patterns should come before generic ones
    const patternMappings: Array<{ pattern: RegExp; path: string }> = [
      // Lights related (must come before other patterns to catch *_LIGHT signals)
      // Match _LIGHT at word boundary (end or followed by _/non-letter)
      { pattern: /_LIGHT(?:_|$|[^A-Z])/i, path: 'Lights' },
      { pattern: /(?:^|_)LIGHT_/i, path: 'Lights' },

      // Doors related
      { pattern: /(?:^|_)DOOR(?:_|$|[^A-Z])/i, path: 'Doors' },

      // Body related
      { pattern: /(?:^|_)TRUNK(?:_|$|[^A-Z])/i, path: 'Doors' },
      { pattern: /(?:^|_)HOOD(?:_|$|[^A-Z])/i, path: 'Doors' },
      { pattern: /(?:^|_)WINDOW(?:_|$|[^A-Z])/i, path: 'Windows' },

      // Transmission related
      { pattern: /(?:^|_)GEAR(?:_|$|[^A-Z])/i, path: 'Transmission' },

      // Chassis related
      { pattern: /(?:^|_)HANDBRAKE(?:_|$|[^A-Z])/i, path: 'Control' },
      { pattern: /(?:^|_)BRAKE(?:_|$|[^A-Z])/i, path: 'Control' },

      // Seatbelts related (more specific first)
      { pattern: /(?:^|_)SEATBELT(?:_|$|[^A-Z])/i, path: 'Seatbelts' },
      { pattern: /(?:^|_)BELT(?:_|$|[^A-Z])/i, path: 'Seatbelts' },

      // Tire related
      { pattern: /_TP_/i, path: 'Tires' },
      { pattern: /_TT_/i, path: 'Tires' },
    ];

    // Check the ID against our pattern mappings (order is preserved)
    for (const { pattern, path } of patternMappings) {
      if (pattern.test(signalId)) {
        return path;
      }
    }

    return undefined;
  }
}