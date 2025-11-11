import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, LintSeverity, LinterRuleConfig, Command } from './rule';
import { detectVehicleType, shouldFilterEvCommand, VehicleType } from '../../utils/vehicleTypeDetection';
import { Command as TypedCommand } from '../../types';

/**
 * Rule that detects and suggests removal of EV-specific commands from ICE vehicle signalsets
 *
 * This rule:
 * 1. Analyzes the entire signalset to detect vehicle type (EV/ICE/HYBRID/UNKNOWN)
 * 2. For ICE vehicles, identifies commands with EV-specific patterns
 * 3. Suggests removal of inappropriate EV commands from ICE signalsets
 */
export class EvCommandFilteringRule implements ILinterRule {
  /**
   * Gets the rule configuration
   */
  public getConfig(): LinterRuleConfig {
    return {
      id: 'ev-command-filtering',
      name: 'EV Command Filtering',
      description: 'Detects EV-specific commands in ICE vehicle signalsets and suggests removal',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }

  /**
   * Validates the entire document for EV command filtering
   * @param rootNode The root JSONC node for the entire document
   */
  public validateDocument(rootNode: jsonc.Node): LintResult[] | null {
    const results: LintResult[] = [];

    // Extract commands array from document
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (!commandsNode || commandsNode.type !== 'array') {
      return null;
    }

    // Parse commands for vehicle type detection
    const commands: TypedCommand[] = [];
    if (commandsNode.children) {
      for (const commandNode of commandsNode.children) {
        try {
          const command = this.parseCommand(commandNode);
          if (command) {
            commands.push(command);
          }
        } catch (error) {
          console.warn('Failed to parse command for vehicle type detection:', error);
        }
      }
    }

    // Detect vehicle type from model name if available
    const modelName = this.inferModelName();
    const vehicleType = detectVehicleType(modelName, commands);

    console.log(`Detected vehicle type: ${vehicleType} for model: ${modelName}`);

    // Only filter for ICE vehicles
    if (vehicleType !== VehicleType.ICE) {
      return null;
    }

    // Check each command for EV patterns
    if (commandsNode.children) {
      for (const commandNode of commandsNode.children) {
        try {
          const command = this.parseCommand(commandNode);
          if (command && shouldFilterEvCommand(command, vehicleType)) {
            // Create lint result suggesting removal
            const commandText = this.buildCommandDescription(command);

            results.push({
              ruleId: this.getConfig().id,
              message: `EV-specific command detected in ICE vehicle signalset: ${commandText}. Consider removing this command.`,
              node: commandNode,
              suggestion: {
                title: `Remove EV command: ${commandText}`,
                edits: [{
                  offset: commandNode.offset,
                  length: commandNode.length + 1, // Include trailing comma/newline
                  newText: ''
                }]
              }
            });
          }
        } catch (error) {
          console.warn('Failed to validate command for EV filtering:', error);
        }
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * Parses a command node into a typed Command object
   */
  private parseCommand(commandNode: jsonc.Node): TypedCommand | null {
    if (commandNode.type !== 'object') {
      return null;
    }

    const command: TypedCommand = {};

    // Extract hdr
    const hdrNode = jsonc.findNodeAtLocation(commandNode, ['hdr']);
    if (hdrNode && hdrNode.type === 'string') {
      command.hdr = hdrNode.value;
    }

    // Extract cmd
    const cmdNode = jsonc.findNodeAtLocation(commandNode, ['cmd']);
    if (cmdNode) {
      command.cmd = cmdNode.value;
    }

    // Extract rax
    const raxNode = jsonc.findNodeAtLocation(commandNode, ['rax']);
    if (raxNode && raxNode.type === 'string') {
      command.rax = raxNode.value;
    }

    // Extract signals
    const signalsNode = jsonc.findNodeAtLocation(commandNode, ['signals']);
    if (signalsNode && signalsNode.type === 'array') {
      command.signals = signalsNode.value || [];
    }

    return command;
  }

  /**
   * Infers model name from workspace or file context
   */
  private inferModelName(): string {
    // In VSCode extension context, we would use workspace folder name
    // For now, return 'Unknown' to rely on command pattern analysis
    return 'Unknown';
  }

  /**
   * Builds a human-readable description of the command
   */
  private buildCommandDescription(command: TypedCommand): string {
    const parts: string[] = [];

    if (command.hdr) {
      parts.push(command.hdr);
    }

    if (command.cmd) {
      if (typeof command.cmd === 'object') {
        const cmdKey = Object.keys(command.cmd)[0];
        const cmdValue = command.cmd[cmdKey];
        parts.push(`${cmdKey}${cmdValue}`);
      } else {
        parts.push(String(command.cmd));
      }
    }

    if (command.rax) {
      parts.push(command.rax);
    }

    return parts.join('.');
  }
}
