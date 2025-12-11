import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

// Use require for dependencies
const levenshtein = require('fast-levenshtein');
const nspell = require('nspell');

/**
 * Rule that checks for typos in signal names using dictionary-based spell checking
 * This provides much better accuracy than hard-coded word lists
 */
export class SignalNameTypoRule implements ILinterRule {
  private spellChecker: any = null;

  // Common automotive/technical abbreviations that are valid even if not in dictionary
  private readonly validAbbreviations: Set<string> = new Set([
    'abs', 'atf', 'esp', 'cvt', 'rpm', 'led', 'obd', 'ecu', 'pcm', 'bcm', 'tcm',
    'vin', 'dtc', 'pid', 'mil', 'egr', 'dpf', 'def', 'scr', 'nox', 'hc',
    'co', 'co2', 'o2', 'afr', 'maf', 'map', 'tps', 'iac', 'evap', 'canp',
    'vvt', 'vtec', 'cam', 'crank', 'knock', 'egt', 'iat', 'ect', 'cht', 'oil',
    'psig', 'psi', 'kpa', 'mph', 'kmh', 'gph', 'lph', 'mpg', 'lpkm',
    'deg', 'temp', 'vol', 'amp', 'ohm', 'hz', 'kwh', 'btuh', 'cfm',
    'api', 'can', 'lin', 'pwm', 'gpio', 'adc', 'dac', 'spi', 'i2c',
    'uart', 'usb', 'tcp', 'udp', 'http', 'https', 'json', 'xml', 'csv',
    'tpms', 'ebs', 'cpc', 'ocv', 'awd', 'osv', 'evse', 'cp', 'pd', 'obc',
    'mdps', 'vcs', 'ign', 'ewp', 'a/c', 'ldc', 'vmcu', 'afs', 'baro', 'dtcs',
  ]);

  // Words that are commonly flagged but are actually correct in automotive context
  private readonly domainSpecificWords: Set<string> = new Set([
    'actuator', 'ecall', 'solenoid', 'injector', 'turbo', 'intercooler', 'radiator',
    'thermostat', 'alternator', 'inverter', 'converter', 'catalyst',
    'manifold', 'throttle', 'drivetrain', 'powertrain', 'driveline',
    'camshaft', 'crankshaft', 'flywheel', 'flexplate', 'torque', 'clutch',
    'differential', 'transaxle', 'halfshaft', 'driveshaft', 'propshaft',
    'coolant', 'antifreeze', 'brake', 'caliper', 'rotor', 'seatbelt',
    'airbag', 'traction', 'stability', 'cruise', 'parking', 'reverse',
    'overdrive', 'lockup', 'downshift', 'upshift', 'kickdown', 'recirculation',
    'wastegate', 'evaporative', 'regen', 'disconnector', 'contactor', 'thermistor',
    'valvematic',
  ]);

  constructor() {
    this.initializeSpellChecker();
  }

  /**
   * Initialize the spell checker with dictionary
   */
  private async initializeSpellChecker(): Promise<void> {
    try {
      // Use dynamic import for ESM module
      const dictionaryEn = await import('dictionary-en');

      // dictionary-en exports aff and dic buffers directly
      this.spellChecker = nspell(dictionaryEn.default);

      // Add domain-specific words to personal dictionary
      this.domainSpecificWords.forEach(word => {
        this.spellChecker.add(word);
      });

      this.validAbbreviations.forEach(abbrev => {
        this.spellChecker.add(abbrev);
      });
    } catch (error) {
      console.warn('Failed to initialize spell checker:', error);
      this.spellChecker = null;
    }
  }

  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'signal-name-typo',
      name: 'Signal Name Spell Check',
      description: 'Uses system dictionary to detect spelling errors in signal names with automotive domain awareness',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }  /**
   * Validates a signal against this rule
   * @param signal The signal to validate
   * @param node The JSONC node for the signal
   */
  public validateSignal(signal: Signal, node: jsonc.Node): LintResult | null {
    if (!signal.name) {
      return null;
    }

    // Find the name property node
    const nameNode = jsonc.findNodeAtLocation(node, ['name']);
    if (!nameNode) return null;

    // Check for typos in the signal name
    const typoResult = this.findTyposInText(signal.name);

    if (typoResult.length > 0) {
      const firstTypo = typoResult[0];

      // Handle case where word is misspelled but has no good suggestion
      if (firstTypo.correction === '?') {
        return {
          ruleId: this.getConfig().id,
          message: `Possible spelling error: "${firstTypo.typo}" appears to be misspelled (no suggestions available)`,
          node: nameNode,
          // No suggestion since we don't have a good correction
        };
      }

      // Normal case with a good suggestion
      const correctedName = this.applyCorrectionToText(signal.name, firstTypo.typo, firstTypo.correction);

      return {
        ruleId: this.getConfig().id,
        message: `Possible spelling error: "${firstTypo.typo}" may be misspelled (suggested: "${firstTypo.correction}")`,
        node: nameNode,
        suggestion: {
          title: `Fix spelling: "${firstTypo.typo}" → "${firstTypo.correction}"`,
          edits: [{
            newText: `"${correctedName}"`,
            offset: nameNode.offset,
            length: nameNode.length
          }]
        }
      };
    }

    return null;
  }

  /**
   * Finds typos in the given text using dictionary spell checking
   * @param text The text to check for typos
   * @returns Array of found typos with their corrections
   */
  private findTyposInText(text: string): Array<{ typo: string; correction: string }> {
    const foundTypos: Array<{ typo: string; correction: string }> = [];

    // Extract words from the text, handling common signal name patterns
    // This regex captures:
    // - Regular words (letters only)
    // - Words that may contain numbers but start with letters
    const words = text.toLowerCase().match(/\b[a-z]+(?:[a-z]*\b|\d*[a-z]+\b)/g) || [];

    for (const word of words) {
      // Skip pure numeric suffixes and very short words
      if (word.length < 3 || /^\d+$/.test(word)) {
        continue;
      }

      const correction = this.findCorrection(word);
      if (correction) {
        foundTypos.push({ typo: word, correction });
      }
    }

    return foundTypos;
  }

  /**
   * Find correction for a potentially misspelled word using dictionary spell checking
   * @param word The word to check
   * @returns The correction if found, null otherwise
   */
  private findCorrection(word: string): string | null {
    const lowerWord = word.toLowerCase();

    // Skip very short words (likely abbreviations)
    if (lowerWord.length < 3) {
      return null;
    }

    // Skip if spell checker isn't initialized
    if (!this.spellChecker) {
      return null;
    }

    // Skip if it's a known valid abbreviation
    if (this.validAbbreviations.has(lowerWord)) {
      return null;
    }

    // Skip if it's a plural form of a valid abbreviation (e.g., "dtcs" from "dtc")
    if (lowerWord.endsWith('s') && lowerWord.length > 1) {
      const baseWord = lowerWord.slice(0, -1);
      if (this.validAbbreviations.has(baseWord)) {
        return null;
      }
    }

    // Skip if it's a known domain-specific word
    if (this.domainSpecificWords.has(lowerWord)) {
      return null;
    }

    // Skip numeric strings or mixed alphanumeric that aren't words
    if (/^\d+$/.test(lowerWord) || /\d/.test(lowerWord)) {
      return null;
    }

    // Use nspell to check if word is misspelled
    const isCorrect = this.spellChecker.correct(word);
    if (isCorrect) {
      return null; // Word is correctly spelled
    }

    // Get suggestions from spell checker
    const suggestions = this.spellChecker.suggest(word);

    if (suggestions && suggestions.length > 0) {
      // Return the first suggestion that seems reasonable
      const firstSuggestion = suggestions[0];

      // Only suggest if the suggestion is reasonably similar
      // (prevents crazy suggestions for technical terms)
      const distance = levenshtein.get(lowerWord, firstSuggestion.toLowerCase());
      const maxDistance = Math.min(2, Math.floor(lowerWord.length / 3));

      if (distance <= maxDistance && firstSuggestion.length >= 3) {
        return firstSuggestion.toLowerCase();
      }
    }

    // If we get here, the word is misspelled but we don't have good suggestions
    // Still return a special marker to indicate it's misspelled
    return '?'; // Special marker indicating misspelled word with no good suggestion
  }

  /**
   * Applies a single correction to text while preserving case
   * @param text The original text
   * @param typo The typo to replace
   * @param correction The correction to apply
   * @returns The corrected text
   */
  private applyCorrectionToText(text: string, typo: string, correction: string): string {
    // Create a regex that matches the typo with word boundaries
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');

    return text.replace(regex, (match) => {
      // Preserve the case of the original match
      return this.preserveCase(match, correction);
    });
  }

  /**
   * Preserves the case pattern of the original word when applying correction
   * @param original The original word (potentially with typo)
   * @param correction The correction to apply
   * @returns The correction with case preserved
   */
  private preserveCase(original: string, correction: string): string {
    // If original is all uppercase, make correction uppercase
    if (original === original.toUpperCase()) {
      return correction.toUpperCase();
    }

    // If original starts with uppercase, capitalize correction
    if (original[0] === original[0].toUpperCase()) {
      return correction.charAt(0).toUpperCase() + correction.slice(1).toLowerCase();
    }

    // Otherwise, return correction in lowercase
    return correction.toLowerCase();
  }
}
