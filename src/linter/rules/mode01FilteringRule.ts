import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, LintSeverity, LinterRuleConfig, Command } from './rule';

/**
 * Rule that detects Mode 01 (standard OBD-II PIDs) commands and suggests removal
 *
 * Mode 01 commands are standard OBD-II PIDs that should be filtered from vehicle-specific signalsets.
 * This matches Python implementation behavior.
 */
export class Mode01FilteringRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'mode-01-filtering',
      name: 'Mode 01 Filtering',
      description: 'Detects Mode 01 (standard OBD-II) commands and suggests removal from vehicle-specific signalsets',
      severity: LintSeverity.Information,
      enabled: true,
    };
  }

  /**
   * Validates a command for Mode 01 pattern
   * @param command The command being validated
   * @param commandNode The JSONC node for the command
   * @param signalsInCommand Array of signals (not used but part of interface)
   */
  public validateCommand(command: Command, commandNode: jsonc.Node, signalsInCommand: { signal: any, node: jsonc.Node }[]): LintResult[] | null {
    // Check if cmd is an object with "01" as a key (Mode 01)
    if (command.cmd && typeof command.cmd === 'object') {
      if ('01' in command.cmd) {
        const cmdNode = jsonc.findNodeAtLocation(commandNode, ['cmd']);

        return [{
          ruleId: this.getConfig().id,
          message: `Mode 01 command detected. Standard OBD-II PIDs should be removed from vehicle-specific signalsets.`,
          node: cmdNode || commandNode,
          suggestion: {
            title: `Remove Mode 01 command`,
            edits: [{
              offset: commandNode.offset,
              length: commandNode.length + 1, // Include trailing comma
              newText: ''
            }]
          }
        }];
      }
    }

    return null;
  }
}
