import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

interface NamingPattern {
  // Pattern to match signal names
  nameContains?: string[];
  // What the ID should contain
  idShouldContain?: string;
  // What the ID should NOT contain
  idShouldNotContain?: string;
  // For suggestedMetric-based rules
  suggestedMetric?: string;
  // For complex name formatting (like wheel speed)
  nameFormatter?: (signal: Signal) => string | null;
  description: string;
}

/**
 * Consolidated rule that checks various signal naming conventions for specific signal types
 */
export class ConsolidatedNamingRule implements ILinterRule {
  private patterns: NamingPattern[] = [
    // Wheel speed naming pattern
    {
      nameContains: ['speed'],
      nameFormatter: (signal: Signal) => {
        if (signal.fmt.len == 1) {
          return null; // Ignore 1-bit signals
        }
        const lowerName = signal.name.toLowerCase();

        let verticalPart: string | null = null;
        if (lowerName.includes('front')) {
          verticalPart = 'Front';
        } else if (lowerName.includes('rear') || lowerName.includes('back')) {
          verticalPart = 'Rear';
        }

        let horizontalPart: string | null = null;
        if (lowerName.includes('left')) {
          horizontalPart = 'left';
        } else if (lowerName.includes('right')) {
          horizontalPart = 'right';
        }

        // Only proceed if all components are found
        if (verticalPart && horizontalPart) {
          return `${verticalPart} ${horizontalPart} wheel speed`;
        }
        return null;
      },
      description: 'Wheel speed signal names should follow the format "[Front/Rear] [left/right] wheel speed"'
    },
    // Odometer ID naming pattern
    {
      suggestedMetric: 'odometer',
      idShouldContain: 'ODO',
      idShouldNotContain: 'ODOMETER',
      description: 'Signals with suggestedMetric "odometer" should have "ODO" in the ID but not "ODOMETER"'
    },
    // Engine oil pressure naming pattern
    {
      nameContains: ['engine', 'oil', 'pressure'],
      idShouldContain: 'EOP',
      description: 'Signals with "engine oil pressure" in the name should have "EOP" in the ID'
    }
  ];

  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'consolidated-naming',
      name: 'Consolidated Naming Convention',
      description: 'Enforces various signal naming conventions for wheel speed, odometer, and engine oil pressure signals.',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    if (!signal.name) {
      return null;
    }

    for (const pattern of this.patterns) {
      const result = this.validateAgainstPattern(signal, node, pattern);
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Validates a signal against a specific pattern
   */
  private validateAgainstPattern(signal: Signal, node: jsonc.Node, pattern: NamingPattern): LintResult | null {
    // Check if this pattern applies to the signal
    if (pattern.suggestedMetric) {
      if (signal.suggestedMetric !== pattern.suggestedMetric) {
        return null;
      }
    } else if (pattern.nameContains) {
      const lowerName = signal.name.toLowerCase();
      const allContained = pattern.nameContains.every(term => lowerName.includes(term));
      if (!allContained) {
        return null;
      }
    }

    // Check name formatting (for wheel speed)
    if (pattern.nameFormatter) {
      const nameNode = jsonc.findNodeAtLocation(node, ['name']);
      if (!nameNode || !nameNode.value) {
        return null;
      }

      const currentName = String(nameNode.value);
      const suggestedName = pattern.nameFormatter(signal);

      if (suggestedName && currentName !== suggestedName) {
        return {
          ruleId: this.getConfig().id,
          message: `${pattern.description}. Current: "${currentName}", Suggested: "${suggestedName}"`,
          node: nameNode,
          suggestion: {
            title: `Rename to: "${suggestedName}"`,
            edits: [{
              newText: `"${suggestedName}"`,
              offset: nameNode.offset,
              length: nameNode.length
            }]
          }
        };
      }
    }

    // Check ID requirements
    if (pattern.idShouldContain || pattern.idShouldNotContain) {
      const idNode = jsonc.findNodeAtLocation(node, ['id']);
      if (!idNode) return null;

      if (pattern.idShouldContain && !signal.id.includes(pattern.idShouldContain)) {
        return {
          ruleId: this.getConfig().id,
          message: `${pattern.description}. Signal ID "${signal.id}" should contain "${pattern.idShouldContain}"`,
          node: idNode
        };
      }

      if (pattern.idShouldNotContain && signal.id.includes(pattern.idShouldNotContain)) {
        let suggestion = undefined;

        // Create suggestion for odometer case
        if (pattern.idShouldContain && pattern.idShouldNotContain) {
          const suggestedId = signal.id.replace(new RegExp(pattern.idShouldNotContain, 'g'), pattern.idShouldContain);
          suggestion = {
            title: `Fix ID: "${suggestedId}"`,
            edits: [{
              newText: `"${suggestedId}"`,
              offset: idNode.offset,
              length: idNode.length
            }]
          };
        }

        return {
          ruleId: this.getConfig().id,
          message: `${pattern.description}. Signal ID "${signal.id}" should not contain "${pattern.idShouldNotContain}"`,
          node: idNode,
          suggestion
        };
      }
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
