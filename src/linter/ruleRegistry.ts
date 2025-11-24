import * as vscode from 'vscode';
import { ILinterRule, LinterRuleConfig } from './rules/rule';

// Import all rule classes directly
import { ConsolidatedNamingRule } from './rules/consolidatedNamingRule';
import { SignalNamingConventionRule } from './rules/signalNamingConventionRule';
import { SuggestedMetricValidationRule } from './rules/suggestedMetricValidationRule';
import { FormulaRangeValidationRule } from './rules/formulaRangeValidationRule';
import { SignalBitOverlapRule } from './rules/signalBitOverlapRule';
import { UniqueSignalIdRule } from './rules/uniqueSignalIdRule';
import { SignalPathSuggestionRule } from './rules/signalPathSuggestionRule';
import { SignalSentenceCaseRule } from './rules/signalSentenceCaseRule';
import { AcronymAtStartOfSignalNameRule } from './rules/acronymAtStartOfSignalNameRule';
import { MapKeyNumericalRule } from './rules/mapKeyNumericalRule';
import { CommandRaxDuplicationRule } from './rules/commandRaxDuplicationRule';
import { SignalNameTypoRule } from './rules/signalNameTypoRule';
import { BracketedContentInSignalNameRule } from './rules/bracketedContentInSignalNameRule';
import { MulToDivSimplificationRule } from './rules/mulToDivSimplificationRule';

/**
 * Registry that manages all linter rules
 */
export class RuleRegistry {
  private static instance: RuleRegistry;
  private rules: ILinterRule[] = [];

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.loadAllRules();
  }

  /**
   * Gets the singleton instance of the rule registry
   */
  public static getInstance(): RuleRegistry {
    if (!RuleRegistry.instance) {
      RuleRegistry.instance = new RuleRegistry();
    }
    return RuleRegistry.instance;
  }

  /**
   * Loads all available rules
   */
  private loadAllRules(): void {
    // Create instances of all rule classes
    // When adding a new rule, just add it to this list
    const ruleClasses = [
      ConsolidatedNamingRule,
      SignalNamingConventionRule,
      SuggestedMetricValidationRule,
      FormulaRangeValidationRule,
      SignalBitOverlapRule,
      UniqueSignalIdRule,
      SignalPathSuggestionRule,
      SignalSentenceCaseRule,
      AcronymAtStartOfSignalNameRule,
      MapKeyNumericalRule,
      CommandRaxDuplicationRule,
      SignalNameTypoRule,
      BracketedContentInSignalNameRule,
      MulToDivSimplificationRule
    ];

    // Instantiate each rule class
    for (const RuleClass of ruleClasses) {
      this.rules.push(new RuleClass());
    }
  }

  /**
   * Gets all registered rules
   */
  public getAllRules(): ILinterRule[] {
    return this.rules;
  }

  /**
   * Gets all enabled rules
   */
  public getEnabledRules(): ILinterRule[] {
    return this.rules.filter(rule => rule.getConfig().enabled);
  }

  /**
   * Gets rule configurations for all rules
   */
  public getAllRuleConfigs(): LinterRuleConfig[] {
    return this.rules.map(rule => rule.getConfig());
  }

  /**
   * Gets a rule by ID
   */
  public getRuleById(ruleId: string): ILinterRule | undefined {
    return this.rules.find(rule => rule.getConfig().id === ruleId);
  }
}