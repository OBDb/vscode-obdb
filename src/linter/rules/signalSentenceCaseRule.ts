import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig } from './rule';

// Brand names and special terms that should be preserved as-is
const PRESERVED_TERMS = new Set([
  'eCall',
  'eDrive',
  'iDrive',
  'xDrive',
]);

/**
 * Rule that validates that signal names follow sentence case convention
 * (first word capitalized, remaining words lowercase), ignoring acronyms
 */
export class SignalSentenceCaseRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'signal-sentence-case',
      name: 'Signal Sentence Case',
      description: 'Signal names should use sentence case (first word capitalized, remaining words lowercase), ignoring acronyms',
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
    // Get the name node to target in diagnostic
    const nameNode = jsonc.findNodeAtLocation(node, ['name']);
    if (!nameNode) return null;

    const signalName = signal.name;
    if (!signalName || signalName.trim() === '') return null;

    // Check if name follows sentence case convention
    const sentenceCasedName = this.convertToSentenceCase(signalName);

    // If the name doesn't match sentence case format
    if (sentenceCasedName !== signalName) {
      return {
        ruleId: this.getConfig().id,
        message: `Signal name "${signalName}" should use sentence case. Expected: "${sentenceCasedName}"`,
        node: nameNode,
        suggestion: {
          title: `Convert to sentence case: "${sentenceCasedName}"`,
          edits: [{
            offset: nameNode.offset,
            length: nameNode.length,
            newText: `"${sentenceCasedName}"`
          }]
        }
      };
    }

    return null;
  }

  /**
   * Converts a string to sentence case, preserving acronyms and brand names
   * @param text The text to convert
   * @returns Sentence-cased text
   */
  private convertToSentenceCase(text: string): string {
    if (!text) return text;

    // Split into words
    const words = text.split(' ');
    if (words.length === 0) return text;

    // Handle first word - check for preserved terms first
    if (PRESERVED_TERMS.has(words[0])) {
      // Keep preserved terms as-is
    } else {
      // Capitalize first word
      words[0] = this.capitalizeFirst(words[0]);
    }

    // Lowercase remaining words, preserving acronyms and brand names
    for (let i = 1; i < words.length; i++) {
      const word = words[i];

      // Check if the word is a preserved term
      if (PRESERVED_TERMS.has(word)) {
        // Keep preserved terms as they are
        continue;
      }

      // Check if the word is an acronym (all uppercase)
      if (this.isAcronym(word)) {
        // Keep acronyms as they are
        continue;
      } else {
        // Convert to lowercase
        words[i] = word.toLowerCase();
      }
    }

    return words.join(' ');
  }

  /**
   * Capitalizes the first letter of a word
   * @param word The word to capitalize
   * @returns Capitalized word
   */
  private capitalizeFirst(word: string): string {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  /**
   * Checks if a word is an acronym
   * We define an acronym as:
   * - All uppercase
   * - At least 1 character long (to allow single-letter acronyms like "D", "P", "R", etc.)
   *
   * Also handles:
   * - Plural acronyms like "DTCs" that should remain uppercase
   * - Slash-separated acronyms like "A/C" (air conditioning)
   * @param word The word to check
   * @returns True if the word is an acronym
   */
  private isAcronym(word: string): boolean {
    if (!word || word.length < 1) return false;

    // Check for slash-separated acronyms (e.g., "A/C", "I/O")
    if (word.includes('/')) {
      const parts = word.split('/');
      // Check if all parts are uppercase letters
      const allPartsUppercase = parts.every(part =>
        part.length > 0 && part === part.toUpperCase() && /^[A-Z0-9]+$/.test(part)
      );
      if (allPartsUppercase) {
        return true;
      }
    }

    // Check for standard acronyms (all uppercase)
    if (word === word.toUpperCase() && /^[A-Z0-9]+$/.test(word)) {
      return true;
    }

    // Check for plural acronyms (e.g., "DTCs", "ECUs")
    // Match words that end with 's' where the rest would be a valid acronym
    if (word.endsWith('s')) {
      const base = word.slice(0, -1); // Remove trailing 's'
      if (base.length >= 1 && base === base.toUpperCase() && /^[A-Z0-9]+$/.test(base)) {
        return true;
      }
    }

    return false;
  }
}