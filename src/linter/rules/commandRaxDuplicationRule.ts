import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, Signal, LintSeverity, LinterRuleConfig, Command } from './rule';

/**
 * Rule that validates that commands with the same 'cmd' definition have 'rax' filters
 * to avoid ambiguous command responses
 */
export class CommandRaxDuplicationRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'command-rax-duplication',
      name: 'Command RAX Duplication Check',
      description: 'Validates that commands with the same "cmd" value have "rax" filters to avoid ambiguous responses',
      severity: LintSeverity.Error,
      enabled: true,
    };
  }

  /**
   * Validates the entire commands array to detect duplicate cmd values without unique rax filters
   * @param commandsNode The JSONC node for the commands array
   * @returns Lint results or null if no issues are found
   */
  public validateCommands(commandsNode: jsonc.Node): LintResult[] | null {
    if (!commandsNode || !commandsNode.children || commandsNode.children.length === 0) {
      return null;
    }

    // Map to store commands by their cmd value
    const cmdToCommandsMap = new Map<string, { command: Command, node: jsonc.Node }[]>();
    const results: LintResult[] = [];

    // First pass: group commands by their cmd value
    for (const commandNode of commandsNode.children) {
      try {
        const command = jsonc.getNodeValue(commandNode) as Command;

        // Skip commands without cmd
        if (!command.cmd) {
          continue;
        }

        // Normalize the cmd value
        const cmdKey = this.normalizeCmdValue(command.cmd);
        if (!cmdKey) {
          continue;
        }

        // Get or create the array for this cmd
        const cmdGroup = cmdToCommandsMap.get(cmdKey) || [];

        // Add the current command to the group
        cmdGroup.push({ command, node: commandNode });
        cmdToCommandsMap.set(cmdKey, cmdGroup);
      } catch (err) {
        console.error('Error processing command:', err);
      }
    }

    // Second pass: check for duplicate cmd values with missing or duplicate rax filters
    for (const [cmdKey, cmdGroup] of cmdToCommandsMap.entries()) {
      // Only process cmd values with multiple commands
      if (cmdGroup.length >= 2) {
        // Check if any are missing the rax filter
        const hasCommandsWithoutRax = cmdGroup.some(c => !c.command.rax);

        // If we have commands without rax
        if (hasCommandsWithoutRax) {
          for (const { command, node } of cmdGroup) {
            // Create a list of all command identifiers for the error message
            const commandList = cmdGroup.map(c => {
              // Generate a descriptive identifier for the command
              const cmdDesc = this.getCommandDescription(c.command);
              const hasRax = c.command.rax ? `with rax='${c.command.rax}'` : 'without rax filter';
              return `${cmdDesc} ${hasRax}`;
            }).join(', ');

            // Find the cmd node to highlight in the error
            const cmdNode = jsonc.findNodeAtLocation(node, ['cmd']) || node;

            results.push({
              ruleId: this.getConfig().id,
              message: `Command has the same cmd=${cmdKey} as other commands: ${commandList}. Each command needs a unique 'rax' filter to avoid ambiguity.`,
              node: cmdNode,
            });
          }
        }

        // Check for duplicate rax values
        const raxGroups = new Map<string, { command: Command, node: jsonc.Node }[]>();

        for (const item of cmdGroup) {
          if (item.command.rax) {
            const raxValue = item.command.rax.toString();
            const raxGroup = raxGroups.get(raxValue) || [];
            raxGroup.push(item);
            raxGroups.set(raxValue, raxGroup);
          }
        }

        // Find any rax groups with duplicates
        for (const [raxValue, raxGroup] of raxGroups.entries()) {
          if (raxGroup.length >= 2) {
            for (const { command, node } of raxGroup) {
              // Find the rax node to highlight in the error
              const raxNode = jsonc.findNodeAtLocation(node, ['rax']) ||
                            jsonc.findNodeAtLocation(node, ['cmd']) ||
                            node;

              results.push({
                ruleId: this.getConfig().id,
                message: `Commands with the same cmd=${cmdKey} have duplicate 'rax=${raxValue}' values. Each command needs a unique 'rax' filter.`,
                node: raxNode,
              });
            }
          }
        }
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * The original per-command validation is now a no-op since we validate commands in bulk
   */
  public validateCommand(): LintResult[] | null {
    return null;
  }

  /**
   * Normalizes a cmd value to a consistent string representation
   * @param cmd The cmd value to normalize
   * @returns A normalized string representation of the cmd value
   */
  private normalizeCmdValue(cmd: any): string | null {
    if (typeof cmd === 'string') {
      return cmd;
    } else if (typeof cmd === 'object' && cmd !== null) {
      if (Object.keys(cmd).length === 1) {
        const key = Object.keys(cmd)[0];
        const value = cmd[key];
        return `${key}${value}`;
      } else {
        return JSON.stringify(cmd);
      }
    }
    return null;
  }

  /**
   * Generates a descriptive identifier for a command
   * @param command The command to describe
   * @returns A descriptive string for the command
   */
  private getCommandDescription(command: Command): string {
    if (command.id && command.id.trim() !== '') {
      return command.id;
    }

    const parts = [];

    if (command.hdr) {
      parts.push(`hdr='${command.hdr}'`);
    }

    if (command.cmd) {
      const cmdStr = this.normalizeCmdValue(command.cmd);
      if (cmdStr) {
        parts.push(`cmd='${cmdStr}'`);
      }
    }

    if (command.name) {
      parts.push(`name='${command.name}'`);
    }

    return parts.length > 0 ? parts.join(', ') : 'unnamed command';
  }
}
