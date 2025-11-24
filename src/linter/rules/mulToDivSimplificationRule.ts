import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that suggests converting "mul" to "div" when the value can be simplified
 * For example: "mul": 0.1 can be replaced with "div": 10
 */
export class MulToDivSimplificationRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'mul-to-div-simplification',
      name: 'Mul to Div Simplification',
      description: 'Suggests converting "mul" to "div" when the multiplication value can be expressed as a simpler division',
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
    // Check if the signal has a fmt object
    if (!signal.fmt) {
      return null;
    }

    // Look for the "mul" property in fmt
    const fmtNode = jsonc.findNodeAtLocation(node, ['fmt']);
    if (!fmtNode) {
      return null;
    }

    const mulNode = jsonc.findNodeAtLocation(fmtNode, ['mul']);
    if (!mulNode || mulNode.type !== 'number') {
      return null;
    }

    const mulValue = mulNode.value as number;

    // Calculate the inverse (what div would be)
    if (mulValue === 0) {
      return null; // Can't divide by zero
    }

    const divValue = 1 / mulValue;

    // Only suggest if div is a clean integer or would be simpler
    // Allow small floating point errors
    const isCleanInteger = Math.abs(divValue - Math.round(divValue)) < 0.0001;

    if (isCleanInteger && divValue > 0) {
      const cleanDivValue = Math.round(divValue);

      // Find the property name node (the "mul" key) and its value
      // We need to replace both "mul": value with "div": newValue
      const fmtChildren = fmtNode.children || [];
      let mulPropertyNode: jsonc.Node | null = null;

      for (const child of fmtChildren) {
        if (child.type === 'property') {
          const keyNode = child.children?.[0];
          if (keyNode && keyNode.type === 'string' && keyNode.value === 'mul') {
            mulPropertyNode = child;
            break;
          }
        }
      }

      if (!mulPropertyNode) {
        return null;
      }

      // Create the replacement text: "div": cleanDivValue
      const newText = `"div": ${cleanDivValue}`;

      return {
        ruleId: this.getConfig().id,
        message: `"mul": ${mulValue} can be simplified to "div": ${cleanDivValue}`,
        node: mulPropertyNode,
        suggestion: {
          title: `Replace "mul": ${mulValue} with "div": ${cleanDivValue}`,
          edits: [{
            offset: mulPropertyNode.offset,
            length: mulPropertyNode.length,
            newText: newText
          }]
        }
      };
    }

    return null;
  }
}
