import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig, Command } from './rule';

/**
 * Rule that validates signal bit ranges don't overlap and suggests removal of obsolete versions
 *
 * This rule matches Python implementation:
 * - Detects bit overlaps within the same command
 * - Auto-suggests removal of obsolete signal versions (_PRE21, _OLD, _V1)
 * - Prefers more specific signal names (e.g., TPMS_TEMP over TT)
 */
export class SignalBitOverlapRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'signal-bit-overlap',
      name: 'Signal Bit Overlap Detection',
      description: 'Validates that signal bit ranges do not overlap and suggests removal of obsolete versions',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }

  /**
   * Validates a command for overlapping signal bit ranges and suggests removal of obsolete versions.
   * Matches Python implementation logic exactly.
   *
   * @param command The command being validated
   * @param commandNode The JSONC node for the command
   * @param signalsInCommand An array of signals belonging to this command, with their respective nodes
   */
  public validateCommand(command: Command, commandNode: jsonc.Node, signalsInCommand: { signal: Signal, node: jsonc.Node }[]): LintResult[] | null {
    const results: LintResult[] = [];
    if (signalsInCommand.length < 2) {
      return null; // Not enough signals to overlap
    }

    // Group signals by bit range for overlap detection
    const bitGroups = new Map<string, { signal: Signal, node: jsonc.Node }[]>();

    for (const { signal, node } of signalsInCommand) {
      if (!signal.fmt || typeof signal.fmt.len !== 'number') {
        continue; // Skip signals without proper format or length
      }
      const bix = signal.fmt.bix || 0;
      const len = signal.fmt.len;
      const bitRangeKey = `${bix}-${bix + len - 1}`;

      if (!bitGroups.has(bitRangeKey)) {
        bitGroups.set(bitRangeKey, []);
      }
      bitGroups.get(bitRangeKey)!.push({ signal, node });
    }

    // Process bit overlaps - only groups with multiple signals
    for (const [bitRange, overlappingSignals] of bitGroups.entries()) {
      if (overlappingSignals.length <= 1) {
        continue; // No overlap
      }

      // Sort by preference: remove obsolete versions, keep more specific names
      // Matches Python implementation
      const signalToRemove = this.selectSignalToRemove(overlappingSignals);

      if (signalToRemove) {
        const signalIds = overlappingSignals.map(s => s.signal.id).join(', ');

        results.push({
          ruleId: this.getConfig().id,
          message: `Obsolete signal '${signalToRemove.signal.id}' overlaps with other signals (${signalIds}) at bits ${bitRange}. Consider removing this obsolete version.`,
          node: signalToRemove.node,
          suggestion: {
            title: `Remove obsolete signal '${signalToRemove.signal.id}'`,
            edits: [{
              offset: signalToRemove.node.offset,
              length: signalToRemove.node.length + 1, // Include trailing comma
              newText: ''
            }]
          }
        });
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * Selects which signal to remove from overlapping signals.
   * Matches Python implementation priority:
   * 1. Remove signals with obsolete suffixes (_PRE21, _OLD, _V1)
   * 2. Keep more specific names (longer, contains TPMS)
   *
   * @param overlappingSignals Array of signals with overlapping bit ranges
   * @returns The signal that should be removed, or null if none should be removed
   */
  private selectSignalToRemove(overlappingSignals: { signal: Signal, node: jsonc.Node }[]): { signal: Signal, node: jsonc.Node } | null {
    const obsoleteSuffixes = ['_PRE21', '_OLD', '_V1'];

    // First priority: remove obsolete versions
    for (const signalEntry of overlappingSignals) {
      const signalId = signalEntry.signal.id;
      if (obsoleteSuffixes.some(suffix => signalId.includes(suffix))) {
        return signalEntry;
      }
    }

    // Second priority: if multiple non-obsolete signals, prefer longer/more specific names
    if (overlappingSignals.length > 1) {
      // Sort by specificity (prefer longer names with TPMS)
      const sorted = [...overlappingSignals].sort((a, b) => {
        const aId = a.signal.id;
        const bId = b.signal.id;

        // Prefer signals with TPMS
        const aHasTpms = aId.includes('TPMS');
        const bHasTpms = bId.includes('TPMS');

        if (aHasTpms && !bHasTpms) return -1;
        if (!aHasTpms && bHasTpms) return 1;

        // Prefer longer names (more descriptive)
        return bId.length - aId.length;
      });

      // Remove the least specific (last in sorted list)
      return sorted[sorted.length - 1];
    }

    return null;
  }
}