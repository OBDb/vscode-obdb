import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Mapping of signal patterns to suggested metrics
 */
interface MetricPattern {
  idPattern?: RegExp;
  namePattern?: RegExp;
  excludeNamePattern?: RegExp;
  suggestedMetric: string;
  description: string;
}

/**
 * Rule that suggests adding suggestedMetric properties based on signal ID and name patterns
 */
export class SuggestedMetricSuggestionRule implements ILinterRule {
  private readonly metricPatterns: MetricPattern[] = [
    // Tire pressure patterns
    {
      idPattern: /TP_FL|TIRE.*PRESSURE.*FL|FL.*TIRE.*PRESSURE/i,
      namePattern: /front\s+left\s+tire\s+pressure/i,
      suggestedMetric: 'frontLeftTirePressure',
      description: 'Front left tire pressure'
    },
    {
      idPattern: /TP_FR|TIRE.*PRESSURE.*FR|FR.*TIRE.*PRESSURE/i,
      namePattern: /front\s+right\s+tire\s+pressure/i,
      suggestedMetric: 'frontRightTirePressure',
      description: 'Front right tire pressure'
    },
    {
      idPattern: /TP_RL|TIRE.*PRESSURE.*RL|RL.*TIRE.*PRESSURE/i,
      namePattern: /rear\s+left\s+tire\s+pressure/i,
      suggestedMetric: 'rearLeftTirePressure',
      description: 'Rear left tire pressure'
    },
    {
      idPattern: /TP_RR|TIRE.*PRESSURE.*RR|RR.*TIRE.*PRESSURE/i,
      namePattern: /rear\s+right\s+tire\s+pressure/i,
      suggestedMetric: 'rearRightTirePressure',
      description: 'Rear right tire pressure'
    },

    // Tire temperature patterns
    {
      idPattern: /TT_FL|TIRE.*TEMP.*FL|FL.*TIRE.*TEMP/i,
      namePattern: /front\s+left\s+tire\s+temp/i,
      suggestedMetric: 'frontLeftTireTemperature',
      description: 'Front left tire temperature'
    },
    {
      idPattern: /TT_FR|TIRE.*TEMP.*FR|FR.*TIRE.*TEMP/i,
      namePattern: /front\s+right\s+tire\s+temp/i,
      suggestedMetric: 'frontRightTireTemperature',
      description: 'Front right tire temperature'
    },
    {
      idPattern: /TT_RL|TIRE.*TEMP.*RL|RL.*TIRE.*TEMP/i,
      namePattern: /rear\s+left\s+tire\s+temp/i,
      suggestedMetric: 'rearLeftTireTemperature',
      description: 'Rear left tire temperature'
    },
    {
      idPattern: /TT_RR|TIRE.*TEMP.*RR|RR.*TIRE.*TEMP/i,
      namePattern: /rear\s+right\s+tire\s+temp/i,
      suggestedMetric: 'rearRightTireTemperature',
      description: 'Rear right tire temperature'
    },

    // Speed patterns
    {
      idPattern: /_?VSS(_|$)/i,
      namePattern: /vehicle\s+speed|^speed$/i,
      suggestedMetric: 'speed',
      description: 'Vehicle speed'
    },

    // Odometer patterns
    {
      idPattern: /ODO(_|$)/i,
      namePattern: /odometer/i,
      suggestedMetric: 'odometer',
      description: 'Odometer'
    },

    // State of charge patterns - exclude minimum/maximum cell SOC
    {
      idPattern: /_?SOC(_|$)|STATE.*CHARGE/i,
      namePattern: /state\s+of\s+charge|battery.*charge.*%|soc/i,
      excludeNamePattern: /minimum|maximum|min\s+|max\s+|cell/i,
      suggestedMetric: 'stateOfCharge',
      description: 'Battery state of charge'
    },

    // State of health patterns
    {
      idPattern: /_?SOH(_|$)|STATE.*HEALTH/i,
      namePattern: /state\s+of\s+health|battery.*health/i,
      suggestedMetric: 'stateOfHealth',
      description: 'Battery state of health'
    },

    // Traction battery voltage (HV battery)
    {
      idPattern: /HV.*BAT.*VOLT|TRACTION.*BAT.*VOLT|HIGH.*VOLT.*BAT.*VOLT/i,
      namePattern: /high\s+voltage\s+battery.*voltage|traction\s+battery.*voltage|hv\s+battery.*voltage/i,
      suggestedMetric: 'tractionBatteryVoltage',
      description: 'Traction battery voltage'
    },

    // Starter battery voltage (12V / Aux battery)
    {
      idPattern: /12V_V|AUX.*BAT.*VOLT|AUXIL.*BAT.*VOLT/i,
      namePattern: /auxiliary\s+battery\s+voltage|12v.*voltage|starter\s+battery/i,
      suggestedMetric: 'starterBatteryVoltage',
      description: 'Starter battery voltage'
    },

    // Charging status
    {
      idPattern: /HV_CHARGING|IS_CHARGING|CHARGING_STATUS/i,
      namePattern: /charging\?|is\s+charging|charging\s+status/i,
      suggestedMetric: 'isCharging',
      description: 'Charging status'
    },
  ];

  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'suggested-metric-suggestion',
      name: 'Suggested Metric Suggestion',
      description: 'Suggests adding suggestedMetric properties based on signal ID and name patterns',
      severity: LintSeverity.Information,
      enabled: false, // Disabled - now handled by CodeLens
    };
  }

  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    // Skip if signal already has a suggestedMetric
    if (signal.suggestedMetric) {
      return null;
    }

    // Skip if signal doesn't have both ID and name
    if (!signal.id || !signal.name) {
      return null;
    }

    // Check each pattern
    for (const pattern of this.metricPatterns) {
      const idMatches = pattern.idPattern ? pattern.idPattern.test(signal.id) : false;
      const nameMatches = pattern.namePattern ? pattern.namePattern.test(signal.name) : false;

      // Check if name matches exclusion pattern
      const excludedByName = pattern.excludeNamePattern && pattern.excludeNamePattern.test(signal.name);

      // Match if either ID or name matches (or both), and not excluded by name
      if ((idMatches || nameMatches) && !excludedByName) {
        return {
          ruleId: this.getConfig().id,
          message: `Consider adding suggestedMetric: "${pattern.suggestedMetric}" (${pattern.description})`,
          node: node,
          suggestion: {
            title: `Add suggestedMetric: "${pattern.suggestedMetric}"`,
            edits: [{
              newText: this.createSignalWithSuggestedMetric(signal, node, pattern.suggestedMetric),
              offset: node.offset,
              length: node.length
            }]
          }
        };
      }
    }

    return null;
  }

  /**
   * Creates the updated signal JSON with suggestedMetric added
   */
  private createSignalWithSuggestedMetric(signal: Signal, node: jsonc.Node, suggestedMetric: string): string {
    // Get the signal object value (not the node itself)
    const signalObj = jsonc.getNodeValue(node) as any;

    // Build the new signal object with suggestedMetric inserted after name
    const orderedSignal: any = {};

    // Add properties in the desired order: id, path, fmt, name, suggestedMetric, then rest
    if (signalObj.id !== undefined) orderedSignal.id = signalObj.id;
    if (signalObj.path !== undefined) orderedSignal.path = signalObj.path;
    if (signalObj.fmt !== undefined) orderedSignal.fmt = signalObj.fmt;
    if (signalObj.name !== undefined) orderedSignal.name = signalObj.name;

    // Add the suggestedMetric
    orderedSignal.suggestedMetric = suggestedMetric;

    // Add any remaining properties
    for (const key of Object.keys(signalObj)) {
      if (!orderedSignal.hasOwnProperty(key)) {
        orderedSignal[key] = signalObj[key];
      }
    }

    return JSON.stringify(orderedSignal);
  }
}
