import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that checks a synthetic's formula against the signals it reads. A
 * synthetic whose formula refers to a missing signal never has a value, and
 * the app passes a select's value through unconverted, so the value signals
 * must share the synthetic's unit.
 */
export class SyntheticFormulaSignalsRule implements ILinterRule {
  public getConfig(): LinterRuleConfig {
    return {
      id: 'synthetic-formula-signals',
      name: 'Synthetic Formula Signals',
      description: 'Checks that a synthetic formula reads signals that exist, and that a select matches its keys and shares its unit',
      severity: LintSeverity.Error,
      enabled: true,
    };
  }

  public validateDocument(rootNode: jsonc.Node): LintResult[] | null {
    const syntheticsNode = jsonc.findNodeAtLocation(rootNode, ['synthetics']);
    if (!syntheticsNode?.children) {
      return null;
    }
    const signals = new Map<string, any>();
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    for (const commandNode of commandsNode?.children ?? []) {
      for (const signal of jsonc.getNodeValue(commandNode)?.signals ?? []) {
        if (typeof signal?.id === 'string') {
          signals.set(signal.id, signal);
        }
      }
    }

    const results: LintResult[] = [];
    for (const syntheticNode of syntheticsNode.children) {
      const synthetic = jsonc.getNodeValue(syntheticNode);
      const formula = synthetic?.formula;
      const formulaNode = jsonc.findNodeAtLocation(syntheticNode, ['formula']) ?? syntheticNode;
      const report = (message: string) => results.push({
        ruleId: this.getConfig().id,
        message: `${synthetic?.id}: ${message}`,
        node: formulaNode,
      });

      if (formula?.op === 'ratio') {
        for (const signalId of [formula.a, formula.b]) {
          if (!signals.has(signalId)) {
            report(`reads ${signalId}, which no command defines.`);
          }
        }
      } else if (formula?.op === 'select') {
        this.validateSelect(synthetic, formula, signals, report);
      }
    }
    return results.length > 0 ? results : null;
  }

  private validateSelect(
    synthetic: any,
    formula: any,
    signals: Map<string, any>,
    report: (message: string) => void
  ) {
    const cases: Record<string, string> = formula.cases ?? {};
    const matchValues = new Set<string>();
    const valueUnits = new Set<string>();

    for (const [keyId, valueId] of Object.entries(cases)) {
      const key = signals.get(keyId);
      if (!key) {
        report(`key ${keyId} is not a signal any command defines.`);
      } else if (!key.fmt?.map) {
        report(`key ${keyId} has no map, so it never decodes to "${formula.match}".`);
      } else {
        for (const entry of Object.values<any>(key.fmt.map)) {
          matchValues.add(entry?.value);
        }
      }

      const value = signals.get(valueId);
      if (!value) {
        report(`value ${valueId} is not a signal any command defines.`);
      } else if (value.fmt?.unit) {
        valueUnits.add(value.fmt.unit);
      }
    }

    if (matchValues.size > 0 && !matchValues.has(formula.match)) {
      report(`no key's map has the value "${formula.match}", so it never selects a case.`);
    }
    if (valueUnits.size > 1) {
      report(`value signals mix units (${[...valueUnits].sort().join(', ')}); a select passes its value through unconverted.`);
    } else if (valueUnits.size === 1 && !valueUnits.has(synthetic.unit)) {
      report(`unit is ${synthetic.unit}, but its value signals are in ${[...valueUnits][0]}, which a select passes through unconverted.`);
    }
  }
}
