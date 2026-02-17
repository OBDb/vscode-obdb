#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import {
  createSimpleCommandId,
  getSupportedModelYearsForCommand,
  getUnsupportedModelYearsForCommand
} from './utils/commandSupportUtils';
import { getGenerations, GenerationSet, formatYearsAsRanges } from './utils/generationsCore';
import { CommandSupportCache } from './caches/commands/commandSupportCache';
import { calculateDebugFilter } from './utils/debugFilterCalculator';
import { CliSignalLinter } from './linter/linterCli';

interface CliOptions {
  command: string;
  workspacePath?: string;
  commit?: boolean;
  json?: boolean;
}

interface CommandSupportOptions extends CliOptions {
  commandId?: string;
}

function parseArgs(): CommandSupportOptions {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];
  let workspacePath: string | undefined;
  let commandId: string | undefined;
  let commit = false;
  let json = false;

  // Parse remaining arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--commit') {
      commit = true;
    } else if (args[i] === '--json') {
      json = true;
    } else if (!workspacePath) {
      workspacePath = args[i];
    } else if (!commandId && command === 'command-support') {
      commandId = args[i];
    }
  }

  return { command, workspacePath, commandId, commit, json };
}

function printUsage(): void {
  console.log('Usage: obdb <command> <workspace-path> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  lint <workspace-path>             Lint signalset for issues and warnings');
  console.log('  optimize <workspace-path>         Parse and optimize signalset');
  console.log('  command-support <workspace-path> <command-id>  Show supported and unsupported model years for a command');
  console.log('');
  console.log('Options:');
  console.log('  --commit                          Apply the optimizations to the file');
  console.log('  --json                            Output results in JSON format (for lint)');
}


interface OptimizationEdit {
  commandId: string;
  newFilter: any | null;
  commandIndex: number;
  useDbgTrue: boolean;
}

async function optimizeCommand(workspacePath: string, commit: boolean = false): Promise<void> {
  const signalsetPath = path.join(workspacePath, 'signalsets', 'v3', 'default.json');

  if (!fs.existsSync(signalsetPath)) {
    console.error(`Error: Signalset file not found at ${signalsetPath}`);
    process.exit(1);
  }

  // Create cache instance for command support lookups
  const cache = new CommandSupportCache();

  // Load generations data to determine earliest and latest model years
  const generations = await getGenerations(workspacePath);
  const generationSet = new GenerationSet(generations || []);
  let earliestYear = generationSet.firstYear;
  let latestYear = generationSet.lastYear;

  console.log(`Generations found: earliest year = ${earliestYear}, latest year = ${latestYear || 'ongoing'}`);

  try {
    let content = await fs.promises.readFile(signalsetPath, 'utf-8');
    const rootNode = jsonc.parseTree(content);

    if (!rootNode) {
      console.error('Error: Failed to parse signalset JSON');
      process.exit(1);
    }

    console.log('Root Node:');
    console.log(`Type: ${rootNode.type}`);
    console.log(`Offset: ${rootNode.offset}`);
    console.log(`Length: ${rootNode.length}`);
    console.log(`Children count: ${rootNode.children?.length || 0}`);

    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (!commandsNode || !commandsNode.children) {
      console.error('Error: No commands array found in signalset');
      process.exit(1);
    }

    console.log(`\nTotal commands: ${commandsNode.children.length}`);
    console.log('\nCommand Analysis:');
    console.log('----------------------------------------');

    const editsToApply: OptimizationEdit[] = [];

    for (let index = 0; index < commandsNode.children.length; index++) {
      const commandNode = commandsNode.children[index];

      const hdrNode = jsonc.findNodeAtLocation(commandNode, ['hdr']);
      const cmdNode = jsonc.findNodeAtLocation(commandNode, ['cmd']);
      const raxNode = jsonc.findNodeAtLocation(commandNode, ['rax']);
      const filterNode = jsonc.findNodeAtLocation(commandNode, ['filter']);

      if (!hdrNode || !cmdNode) {
        console.log(`  ${index + 1}. [Missing hdr or cmd]`);
        continue;
      }

      const hdr = jsonc.getNodeValue(hdrNode);
      const cmd = jsonc.getNodeValue(cmdNode);
      const rax = raxNode ? jsonc.getNodeValue(raxNode) : undefined;
      const commandFilter = filterNode ? jsonc.getNodeValue(filterNode) : undefined;

      const commandId = createSimpleCommandId(hdr, cmd, rax);
      const supportedYears = await getSupportedModelYearsForCommand(commandId, workspacePath, cache);
      const unsupportedYears = await getUnsupportedModelYearsForCommand(commandId, workspacePath, cache);

      console.log(`  ${index + 1}. ${commandId}`);
      console.log(`     Supported years: ${supportedYears.length > 0 ? supportedYears.join(', ') : 'none'}`);
      console.log(`     Unsupported years: ${unsupportedYears.length > 0 ? unsupportedYears.join(', ') : 'none'}`);

      const newFilter = calculateDebugFilter(supportedYears, generationSet, commandFilter);

      if (newFilter === null) {
        console.log(`     ✅ Setting: "dbg": true`);
        editsToApply.push({
          commandId,
          newFilter: null,
          commandIndex: index,
          useDbgTrue: true
        });
      } else {
        console.log(`     ✅ Setting dbgfilter: ${JSON.stringify(newFilter)}`);
        editsToApply.push({
          commandId,
          newFilter,
          commandIndex: index,
          useDbgTrue: false
        });
      }

      console.log('');
    }

    // Apply edits if --commit flag is provided
    if (commit && editsToApply.length > 0) {
      console.log('\n🔧 Applying optimizations...\n');

      // Process edits in reverse order to avoid offset issues
      const sortedEdits = [...editsToApply].sort((a, b) => b.commandIndex - a.commandIndex);

      for (const edit of sortedEdits) {
        const commandNode = commandsNode.children![edit.commandIndex];
        const commandStart = commandNode.offset;
        const commandEnd = commandNode.offset + commandNode.length;
        let commandText = content.substring(commandStart, commandEnd);

        // First, remove "dbg"
        commandText = commandText.replace(/,\s*"dbg"\s*:\s*true/g, '');
        commandText = commandText.replace(/"dbg"\s*:\s*true\s*,?\s*/g, '');

        // Then, remove "dbgfilter"
        commandText = commandText.replace(/,\s*"dbgfilter"\s*:\s*\{[^}]*\}/g, '');
        commandText = commandText.replace(/"dbgfilter"\s*:\s*\{[^}]*\}\s*,?\s*/g, '');

        // Find the first line (header line with hdr, rax, cmd)
        const lines = commandText.split('\n');
        if (lines.length > 0) {
          let firstLine = lines[0];

          // Clean up any extra commas or spaces from removals
          firstLine = firstLine.replace(/,\s*,/g, ',').trim();

          if (edit.useDbgTrue) {
            // Add "dbg": true
            if (firstLine.endsWith(',')) {
              firstLine = firstLine.replace(/,\s*$/, ', "dbg": true,');
            } else {
              firstLine = firstLine + ', "dbg": true';
            }
          } else {
            // Add dbgfilter
            const filter = edit.newFilter!;
            const orderedFilter: any = {};
            if (filter.to !== undefined) orderedFilter.to = filter.to;
            if (filter.years !== undefined) orderedFilter.years = filter.years;
            if (filter.from !== undefined) orderedFilter.from = filter.from;

            const filterJson = JSON.stringify(orderedFilter)
              .replace(/^{/, '{ ')
              .replace(/}$/, ' }')
              .replace(/":/g, '": ')
              .replace(/,"/g, ', "')
              .replace(/,(\d)/g, ', $1')
              .replace(/\[(\d)/g, '[$1')
              .replace(/(\d)\]/g, '$1]');

            if (firstLine.endsWith(',')) {
              firstLine = firstLine.replace(/,\s*$/, `, "dbgfilter": ${filterJson},`);
            } else {
              firstLine = firstLine + `, "dbgfilter": ${filterJson}`;
            }
          }

          lines[0] = firstLine;
          commandText = lines.join('\n');
        }

        content = content.substring(0, commandStart) + commandText + content.substring(commandEnd);
        const action = edit.useDbgTrue ? 'Set "dbg": true' : 'Set dbgfilter';
        console.log(`  ✅ ${action} for ${edit.commandId}`);
      }

      await fs.promises.writeFile(signalsetPath, content, 'utf-8');
      console.log(`\n✅ Successfully updated ${signalsetPath}`);
      console.log(`📝 Applied ${editsToApply.length} optimization(s)`);
    } else if (!commit) {
      console.log(`\n💡 Use --commit to apply changes to the file.`);
    }
  } catch (error) {
    console.error('Error reading signalset:', error);
    process.exit(1);
  }
}

async function commandSupportCommand(workspacePath: string, commandId: string, jsonOutput: boolean = false): Promise<void> {
  if (!fs.existsSync(workspacePath)) {
    console.error(`Error: Workspace path does not exist: ${workspacePath}`);
    process.exit(1);
  }

  if (!commandId) {
    console.error('Error: Command ID is required for command-support');
    printUsage();
    process.exit(1);
  }

  // Create cache instance for command support lookups
  const cache = new CommandSupportCache();

  try {
    // Get supported and unsupported model years
    const [supportedYears, unsupportedYears] = await Promise.all([
      getSupportedModelYearsForCommand(commandId, workspacePath, cache),
      getUnsupportedModelYearsForCommand(commandId, workspacePath, cache)
    ]);

    // Sort years numerically
    const sortedSupportedYears = supportedYears.sort((a, b) => parseInt(a) - parseInt(b));
    const sortedUnsupportedYears = unsupportedYears.sort((a, b) => parseInt(a) - parseInt(b));

    if (jsonOutput) {
      // Output JSON with formatted year ranges
      const result = {
        supported: formatYearsAsRanges(sortedSupportedYears),
        unsupported: formatYearsAsRanges(sortedUnsupportedYears)
      };
      console.log(JSON.stringify(result));
    } else {
      // Display results
      console.log(`Analyzing command support for: ${commandId}`);
      console.log(`Workspace: ${workspacePath}`);
      console.log('');
      console.log('📊 Command Support Analysis:');
      console.log('');

      if (sortedSupportedYears.length > 0) {
        console.log(`✅ Supported model years (${sortedSupportedYears.length}):`);
        console.log(`   ${sortedSupportedYears.join(', ')}`);
      } else {
        console.log('✅ Supported model years: None found');
      }

      console.log('');

      if (sortedUnsupportedYears.length > 0) {
        console.log(`❌ Unsupported model years (${sortedUnsupportedYears.length}):`);
        console.log(`   ${sortedUnsupportedYears.join(', ')}`);
      } else {
        console.log('❌ Unsupported model years: None found');
      }

      console.log('');

      // Summary
      const totalYears = sortedSupportedYears.length + sortedUnsupportedYears.length;
      if (totalYears > 0) {
        const supportPercentage = Math.round((sortedSupportedYears.length / totalYears) * 100);
        console.log(`📈 Summary: ${sortedSupportedYears.length}/${totalYears} model years supported (${supportPercentage}%)`);
      } else {
        console.log('📈 Summary: No support data found for this command');
      }
    }

  } catch (error) {
    console.error('Error analyzing command support:', error);
    process.exit(1);
  }
}

async function lintCommand(workspacePath: string, jsonOutput: boolean = false): Promise<void> {
  if (!fs.existsSync(workspacePath)) {
    console.error(`Error: Workspace path does not exist: ${workspacePath}`);
    process.exit(1);
  }

  const signalsetPath = path.join(workspacePath, 'signalsets', 'v3', 'default.json');

  if (!fs.existsSync(signalsetPath)) {
    console.error(`Error: Signalset file not found at ${signalsetPath}`);
    process.exit(1);
  }

  try {
    const content = await fs.promises.readFile(signalsetPath, 'utf-8');
    const rootNode = jsonc.parseTree(content);

    if (!rootNode) {
      console.error('Error: Failed to parse signalset JSON');
      process.exit(1);
    }

    // Create linter instance and run all checks
    const linter = new CliSignalLinter();
    const allResults: any[] = [];

    // Lint at document level
    const documentResults = linter.lintDocument(rootNode);
    allResults.push(...documentResults);

    // Lint commands and signals
    const commandsNode = jsonc.findNodeAtLocation(rootNode, ['commands']);
    if (commandsNode && commandsNode.children) {
      const commandResults = linter.lintCommands(commandsNode);
      allResults.push(...commandResults);

      // Lint each command and its signals
      for (const commandNode of commandsNode.children) {
        const command = jsonc.getNodeValue(commandNode);
        const signalsNode = jsonc.findNodeAtLocation(commandNode, ['signals']);
        
        const cmdResults = linter.lintCommand(command, commandNode, 
          signalsNode?.children?.map((signalNode: jsonc.Node) => ({
            signal: jsonc.getNodeValue(signalNode),
            node: signalNode
          })) || []
        );
        allResults.push(...cmdResults);

        // Lint each signal
        if (signalsNode?.children) {
          for (const signalNode of signalsNode.children) {
            const signal = jsonc.getNodeValue(signalNode);
            const signalResults = linter.lintSignal(signal, signalNode);
            allResults.push(...signalResults);
          }
        }
      }
    }

    if (jsonOutput) {
      // Output as JSON
      console.log(JSON.stringify(allResults, null, 2));
    } else {
      // Format and display human-readable output
      if (allResults.length === 0) {
        console.log('[bold green]✓ No issues found![/bold green]');
        return;
      }

      console.log(`[bold]Linting Results:[/bold] ${signalsetPath}`);
      console.log(`[dim]Found ${allResults.length} issue(s)[/dim]`);
      console.log('');

      // Group by severity (infer from ruleId or message patterns)
      const errors = allResults.filter(r => r.ruleId?.includes('Error') || r.message?.includes('error'));
      const warnings = allResults.filter(r => r.ruleId?.includes('Warning') || r.message?.includes('warning'));
      const info = allResults.filter(r => !errors.includes(r) && !warnings.includes(r));

      if (errors.length > 0) {
        console.log(`[bold red]Errors (${errors.length})[/bold red]`);
        for (const issue of errors) {
          console.log(`  [red]✗[/red] ${issue.ruleId}: ${issue.message}`);
        }
        console.log('');
      }

      if (warnings.length > 0) {
        console.log(`[bold yellow]Warnings (${warnings.length})[/bold yellow]`);
        for (const issue of warnings) {
          console.log(`  [yellow]⚠[/yellow] ${issue.ruleId}: ${issue.message}`);
        }
        console.log('');
      }

      if (info.length > 0) {
        console.log(`[bold cyan]Info (${info.length})[/bold cyan]`);
        for (const issue of info.slice(0, 10)) {
          console.log(`  [cyan]ℹ[/cyan] ${issue.ruleId}: ${issue.message}`);
        }
        if (info.length > 10) {
          console.log(`  ... and ${info.length - 10} more`);
        }
        console.log('');
      }

      console.log(`[dim]Total: ${allResults.length} issue(s)[/dim]`);
    }

  } catch (error) {
    console.error('Error linting signalset:', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  switch (options.command) {
    case 'lint':
      if (!options.workspacePath) {
        console.error('Error: workspace-path is required for lint command');
        printUsage();
        process.exit(1);
      }
      await lintCommand(options.workspacePath, options.json || false);
      break;
    case 'optimize':
      if (!options.workspacePath) {
        console.error('Error: workspace-path is required for optimize command');
        printUsage();
        process.exit(1);
      }
      await optimizeCommand(options.workspacePath, options.commit || false);
      break;
    case 'command-support':
      if (!options.workspacePath) {
        console.error('Error: workspace-path is required for command-support');
        printUsage();
        process.exit(1);
      }
      if (!options.commandId) {
        console.error('Error: command-id is required for command-support');
        printUsage();
        process.exit(1);
      }
      await commandSupportCommand(options.workspacePath, options.commandId, options.json || false);
      break;
    default:
      console.error(`Error: Unknown command '${options.command}'`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
