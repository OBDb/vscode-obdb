import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that flags an `ecu` entry no command matches. Such an entry names a
 * module the signalset never asks, usually one whose commands were removed or
 * moved to another header.
 */
export class EcuEntryUnusedRule implements ILinterRule {
  public getConfig(): LinterRuleConfig {
    return {
      id: 'ecu-entry-unused',
      name: 'Unused ECU Entry',
      description: 'Flags ecu entries whose address no command is sent to',
      severity: LintSeverity.Warning,
      enabled: true,
    };
  }

  public validateDocument(rootNode: jsonc.Node): LintResult[] | null {
    const ecuNode = jsonc.findNodeAtLocation(rootNode, ['ecu']);
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (!ecuNode?.children || !commandsNode?.children) {
      return null;
    }
    const commands = commandsNode.children.map(node => jsonc.getNodeValue(node));

    const results: LintResult[] = [];
    for (const entryNode of ecuNode.children) {
      const entry = jsonc.getNodeValue(entryNode);
      const used = commands.some(command =>
        command.hdr === entry.hdr &&
        (entry.eax === undefined || command.eax === entry.eax) &&
        (entry.rax === undefined || command.rax === entry.rax));
      if (!used) {
        const address = [entry.hdr, entry.eax, entry.rax].filter(part => part !== undefined).join('.');
        results.push({
          ruleId: this.getConfig().id,
          message: `No command is sent to ${address}, so this ecu entry names nothing.`,
          node: entryNode,
        });
      }
    }
    return results.length > 0 ? results : null;
  }
}
