import * as jsonc from 'jsonc-parser';
import { ILinterRule, LintResult, LintSeverity, LinterRuleConfig } from './rule';

/**
 * Rule that points out 29-bit physical headers (DAxx) an `ecu` list leaves
 * unmapped. A 29-bit reply names the module that sent it, so these addresses
 * are the cheapest to map. Signalsets with no `ecu` list are left alone until
 * someone starts mapping them.
 */
export class EcuUnmappedPhysicalHeaderRule implements ILinterRule {
  public getConfig(): LinterRuleConfig {
    return {
      id: 'ecu-unmapped-physical-header',
      name: 'Unmapped 29-bit Physical Header',
      description: 'Points out DAxx headers that the ecu list does not map',
      severity: LintSeverity.Information,
      enabled: true,
    };
  }

  public validateDocument(rootNode: jsonc.Node): LintResult[] | null {
    const ecuNode = jsonc.findNodeAtLocation(rootNode, ['ecu']);
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (!ecuNode?.children || !commandsNode?.children) {
      return null;
    }
    const mappedHeaders = new Set(ecuNode.children.map(node => jsonc.getNodeValue(node).hdr));

    const results: LintResult[] = [];
    const reported = new Set<string>();
    for (const commandNode of commandsNode.children) {
      const hdr = jsonc.getNodeValue(commandNode).hdr;
      if (typeof hdr !== 'string' || !/^DA[0-9A-F]{2}$/i.test(hdr)) {
        continue;
      }
      if (mappedHeaders.has(hdr) || reported.has(hdr)) {
        continue;
      }
      reported.add(hdr);
      results.push({
        ruleId: this.getConfig().id,
        message: `${hdr} answers from module ${hdr.slice(2)}, but no ecu entry says what that module is.`,
        node: jsonc.findNodeAtLocation(commandNode, ['hdr']) || commandNode,
      });
    }
    return results.length > 0 ? results : null;
  }
}
