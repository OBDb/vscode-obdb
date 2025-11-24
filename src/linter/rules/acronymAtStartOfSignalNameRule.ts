import * as jsonc from 'jsonc-parser';
import { ILinterRule, LinterRuleConfig, LintResult, LintSeverity, Signal, SignalGroup } from './rule';

// Map of automotive acronyms to their full expanded names
const ACRONYM_EXPANSIONS: Record<string, string> = {
  'ABS': 'Anti-lock braking system',
  'ACC': 'Adaptive cruise control',
  'ACM': 'Audio control module',
  'ACU': 'Airbag control unit',
  'ADAS': 'Advanced driver assistance systems',
  'AFR': 'Air-fuel ratio',
  'ATF': 'Automatic transmission fluid',
  'BCM': 'Body control module',
  'BMS': 'Battery management system',
  'CAN': 'Controller area network',
  'CCM': 'Climate control module',
  'CDI': 'Capacitor discharge ignition',
  'CPC': 'Canister purge control',
  'CVT': 'Continuously variable transmission',
  'CVVT': 'Continuously variable valve timing',
  'DPF': 'Diesel particulate filter',
  'DSC': 'Dynamic stability control',
  'ECB': 'Electronic control brake',
  'ECM': 'Engine control module',
  'ECU': 'Electronic control unit',
  'EGR': 'Exhaust gas recirculation',
  'EPS': 'Electric power steering',
  'ESC': 'Electronic stability control',
  'ESP': 'Electronic stability program',
  'ETC': 'Electronic throttle control',
  'GPS': 'Global positioning system',
  'HVAC': 'Heating, ventilation, and air conditioning',
  'ICE': 'Internal combustion engine',
  'ICM': 'Ignition control module',
  'IMA': 'Integrated motor assist',
  'IMMO': 'Immobilizer',
  'IPC': 'Instrument panel cluster',
  'LCA': 'Lane change assist',
  'LKA': 'Lane keep assist',
  'MAF': 'Mass air flow',
  'MAP': 'Manifold absolute pressure',
  'OBD': 'On-board diagnostics',
  'OCS': 'Occupant classification system',
  'OCV': 'Oil control valve',
  'PCM': 'Powertrain control module',
  'PDC': 'Park distance control',
  'RCM': 'Restraint control module',
  'SAS': 'Steering angle sensor',
  'SRS': 'Supplemental restraint system',
  'TCM': 'Transmission control module',
  'TCS': 'Traction control system',
  'TPS': 'Throttle position sensor',
  'TPMS': 'Tire pressure monitoring system',
  'VIN': 'Vehicle identification number',
  'VSC': 'Vehicle stability control',
  'VVT': 'Variable valve timing',
  // Add more acronyms as needed
};

// Get list of acronyms from the expansions map
const COMMON_ACRONYMS = Object.keys(ACRONYM_EXPANSIONS);

export class AcronymAtStartOfSignalNameRule implements ILinterRule {
  private config: LinterRuleConfig = {
    id: 'acronym-at-start-of-signal-name',
    name: 'Acronym at Start of Signal Name',
    description: 'Signal names should not start with common automotive acronyms.',
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
    // Get the name node to target in diagnostic
    const signalName = signal.name;
    const nameNode = jsonc.findNodeAtLocation(node, ['name']);

    if (!nameNode) {
      return null; // Should not happen if signal.name exists
    }

    for (const acronym of COMMON_ACRONYMS) {
      const upperSignalName = signalName.toUpperCase();
      const startsWithAcronymSpace = upperSignalName.startsWith(acronym + ' ');
      const startsWithAcronymUnderscore = upperSignalName.startsWith(acronym + '_');
      const isExactAcronym = upperSignalName === acronym;

      if (startsWithAcronymSpace || startsWithAcronymUnderscore || isExactAcronym) {
        // Get the expansion for this acronym
        const expansion = ACRONYM_EXPANSIONS[acronym];

        // Create the suggested name by replacing the acronym with its expansion
        let suggestedName: string;
        if (startsWithAcronymSpace) {
          // Replace "ATF temperature" with "Automatic transmission fluid temperature"
          const remainder = signalName.substring(acronym.length + 1); // +1 for the space
          suggestedName = this.toSentenceCase(expansion) + ' ' + remainder;
        } else if (startsWithAcronymUnderscore) {
          // Replace "ATF_temperature" with "Automatic transmission fluid temperature"
          const remainder = signalName.substring(acronym.length + 1); // +1 for the underscore
          suggestedName = this.toSentenceCase(expansion) + ' ' + remainder.replace(/_/g, ' ');
        } else {
          // Just the acronym itself
          suggestedName = this.toSentenceCase(expansion);
        }

        return {
          ruleId: this.config.id,
          message: `Signal name '${signalName}' starts with an acronym '${acronym}'. Use the path property to organize signals. Consider removing the acronym or rephrasing the name.`,
          node: nameNode,
          suggestion: {
            title: `Expand acronym: "${acronym}" → "${expansion}"`,
            edits: [{
              newText: `"${suggestedName}"`,
              offset: nameNode.offset,
              length: nameNode.length
            }]
          }
        };
      }
    }

    return null;
  }

  /**
   * Converts a string to sentence case (first letter capitalized, rest lowercase)
   * @param text The text to convert
   * @returns The text in sentence case
   */
  private toSentenceCase(text: string): string {
    if (!text || text.length === 0) {
      return text;
    }
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
}
