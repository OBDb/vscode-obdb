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
    // Standard pattern mappings from ID keywords to paths
    const patternMappings: { [pattern: string]: string } = {
      // Doors related
      'DOOR': 'Doors',
      '_DOOR_': 'Doors',

      // Body related
      'TRUNK': 'Doors',
      'HOOD': 'Doors',
      'WINDOW': 'Windows',

      // Transmission related
      'GEAR': 'Transmission',

      // Chassis related
      'BRAKE': 'Control',
      'HANDBRAKE': 'Control',

      // Seatbelts related
      'BELT': 'Seatbelts',
      'SEATBELT': 'Seatbelts',

      // Tire related
      '_TP_': 'Tires',
      '_TT_': 'Tires',
    };

    // Check the ID against our pattern mappings
    for (const pattern in patternMappings) {
      if (signalId.includes(pattern)) {
        return patternMappings[pattern];
      }
    }

    return undefined;
  }
}