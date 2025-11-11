import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig, SignalGroup } from './rule';

/**
 * Rule that validates that signal and signal group IDs are unique across the entire file.
 */
export class UniqueSignalIdRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'unique-signal-id',
      name: 'Unique Signal ID',
      description: 'Validates that signal IDs are unique across all commands in a file',
      severity: LintSeverity.Error,
      enabled: true,
    };
  }

  /**
   * Validates the entire document at once to check for duplicate signal IDs.
   * @param rootNode The root JSONC node for the entire document
   * @returns Lint results or null if no issues are found
   */
  public validateDocument(rootNode: jsonc.Node): LintResult[] | null {
    if (!rootNode) {
      return null;
    }

    const results: LintResult[] = [];
    const idMap = new Map<string, { node: jsonc.Node, count: number }>();

    // Process commands array first
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (commandsNode && commandsNode.type === 'array' && commandsNode.children) {
      for (const commandNode of commandsNode.children) {
        const signalsNode = jsonc.findNodeAtLocation(commandNode, ['signals']);
        if (signalsNode && signalsNode.type === 'array' && signalsNode.children) {
          for (const signalNode of signalsNode.children) {
            this.checkForDuplicateId(signalNode, idMap, results);
          }
        }
      }
    }

    // Process signal groups array
    const signalGroupsNode = jsonc.findNodeAtLocation(rootNode, ['signalGroups']);
    if (signalGroupsNode && signalGroupsNode.type === 'array' && signalGroupsNode.children) {
      for (const signalGroupNode of signalGroupsNode.children) {
        this.checkForDuplicateId(signalGroupNode, idMap, results);
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * Checks if a node has a duplicate ID and adds a result to the results array if it does.
   * @param node The node to check
   * @param idMap Map of previously seen IDs to their nodes and occurrence count
   * @param results Array to add results to
   */
  private checkForDuplicateId(node: jsonc.Node, idMap: Map<string, { node: jsonc.Node, count: number }>, results: LintResult[]): void {
    try {
      const idNode = jsonc.findNodeAtLocation(node, ['id']);
      if (!idNode) {
        return;
      }

      const id = jsonc.getNodeValue(idNode);
      if (typeof id !== 'string' || id.trim() === '') {
        return;
      }

      // If we've seen this ID before, it's a duplicate
      if (idMap.has(id)) {
        const entry = idMap.get(id)!;
        entry.count++;

        // Generate versioned ID using semantic versioning (matches Python implementation)
        const newId = this.generateVersionedId(id, entry.count);

        results.push({
          ruleId: this.getConfig().id,
          message: `ID "${id}" is not unique. Another signal or signal group in this file uses the same ID. Suggest renaming to "${newId}".`,
          node: idNode,
          suggestion: {
            title: `Rename to "${newId}"`,
            edits: [{
              offset: idNode.offset,
              length: idNode.length,
              newText: `"${newId}"`
            }]
          }
        });
      } else {
        // Otherwise, record that we've seen this ID
        idMap.set(id, { node, count: 1 });
      }
    } catch (err) {
      console.error('Error checking for duplicate ID:', err);
    }
  }

  /**
   * Generates a versioned ID using semantic versioning for duplicates
   * Matches Python implementation exactly:
   * - First duplicate becomes _V2
   * - Second duplicate becomes _V3, etc.
   *
   * @param originalId The original signal ID
   * @param occurrenceCount The number of times we've seen this ID (1-based)
   * @returns Versioned ID (e.g., "SIGNAL_V2", "SIGNAL_V3")
   */
  private generateVersionedId(originalId: string, occurrenceCount: number): string {
    let baseId = originalId;

    // Check if already has version suffix (_V pattern)
    if (originalId.includes('_V')) {
      const parts = originalId.split('_V');
      baseId = parts[0];
      // Start from next version number
      return `${baseId}_V${occurrenceCount + 1}`;
    } else {
      // Start from V2 for first duplicate (occurrenceCount will be 2)
      return `${baseId}_V${occurrenceCount + 1}`;
    }
  }

  /**
   * The original per-signal validation is now a no-op since we validate signals in bulk
   */
  public validateSignal(): LintResult | null {
    return null;
  }
}