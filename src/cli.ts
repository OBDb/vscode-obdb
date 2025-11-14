#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import {
  createSimpleCommandId,
  getSupportedModelYearsForCommand,
  getUnsupportedModelYearsForCommand
} from './utils/commandSupportUtils';
import { getGenerations, GenerationSet } from './utils/generationsCore';

interface CliOptions {
  command: string;
  workspacePath?: string;
  commit?: boolean;
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

  // Parse remaining arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--commit') {
      commit = true;
    } else if (!workspacePath) {
      workspacePath = args[i];
    } else if (!commandId && command === 'command-support') {
      commandId = args[i];
    }
  }

  return { command, workspacePath, commandId, commit };
}

function printUsage(): void {
  console.log('Usage: obdb <command> <workspace-path> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  optimize <workspace-path>         Parse and optimize signalset');
  console.log('  command-support <workspace-path> <command-id>  Show supported and unsupported model years for a command');
  console.log('');
  console.log('Options:');
  console.log('  --commit                          Apply the optimizations to the file');
}


/**
 * Calculates the debug filter based on supported years
 * Returns null if the command should have "dbg": true instead
 * @param supportedYears Array of supported model years
 * @param generationSet Generation information for the vehicle
 */
function calculateDebugFilter(
  supportedYears: string[],
  generationSet: GenerationSet
): any | null {
  const supported = supportedYears.map(y => parseInt(y, 10));

  // Only use supported years to determine the bounds of the filter
  // Unsupported years don't give us definitive information - they just mean
  // the command doesn't work with the current configuration
  if (supported.length === 0) {
    return null;
  }

  let minYear = Math.min(...supported);
  let maxYear = Math.max(...supported);

  // Constrain to generation bounds if available
  if (generationSet.firstYear !== undefined && minYear < generationSet.firstYear) {
    minYear = generationSet.firstYear;
  }
  if (generationSet.lastYear !== undefined && maxYear > generationSet.lastYear) {
    maxYear = generationSet.lastYear;
  }

  // Build the filter
  const filter: any = {};

  // "to" is the smallest year minus one (but not before earliest year if specified)
  const toYear = minYear - 1;
  if (toYear >= generationSet.firstYear) {
    filter.to = toYear;
  }

  // Find years between min and max (exclusive) that are NOT supported
  // This includes both explicitly unsupported years and unknown years
  // We keep unsupported years in the debug filter because the command might work with different configurations
  // Years at the boundaries are covered by "to" and "from"
  const gapYears: number[] = [];
  for (let year = minYear + 1; year < maxYear; year++) {
    if (!supported.includes(year)) {
      gapYears.push(year);
    }
  }

  if (gapYears.length > 0) {
    filter.years = gapYears;
  }

  // "from" is the largest year plus one (but not after latest year if specified)
  const fromYear = maxYear + 1;
  if (!generationSet.lastYear || fromYear <= generationSet.lastYear + 1) {
    filter.from = fromYear;
  }

  return filter;
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

      if (!hdrNode || !cmdNode) {
        console.log(`  ${index + 1}. [Missing hdr or cmd]`);
        continue;
      }

      const hdr = jsonc.getNodeValue(hdrNode);
      const cmd = jsonc.getNodeValue(cmdNode);
      const rax = raxNode ? jsonc.getNodeValue(raxNode) : undefined;

      const commandId = createSimpleCommandId(hdr, cmd, rax);
      const supportedYears = await getSupportedModelYearsForCommand(commandId, workspacePath);
      const unsupportedYears = await getUnsupportedModelYearsForCommand(commandId, workspacePath);

      console.log(`  ${index + 1}. ${commandId}`);
      console.log(`     Supported years: ${supportedYears.length > 0 ? supportedYears.join(', ') : 'none'}`);
      console.log(`     Unsupported years: ${unsupportedYears.length > 0 ? unsupportedYears.join(', ') : 'none'}`);

      const newFilter = calculateDebugFilter(supportedYears, generationSet);

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

async function commandSupportCommand(workspacePath: string, commandId: string): Promise<void> {
  if (!fs.existsSync(workspacePath)) {
    console.error(`Error: Workspace path does not exist: ${workspacePath}`);
    process.exit(1);
  }

  if (!commandId) {
    console.error('Error: Command ID is required for command-support');
    printUsage();
    process.exit(1);
  }

  console.log(`Analyzing command support for: ${commandId}`);
  console.log(`Workspace: ${workspacePath}`);
  console.log('');

  try {
    // Get supported and unsupported model years
    const [supportedYears, unsupportedYears] = await Promise.all([
      getSupportedModelYearsForCommand(commandId, workspacePath),
      getUnsupportedModelYearsForCommand(commandId, workspacePath)
    ]);

    // Sort years numerically
    const sortedSupportedYears = supportedYears.sort((a, b) => parseInt(a) - parseInt(b));
    const sortedUnsupportedYears = unsupportedYears.sort((a, b) => parseInt(a) - parseInt(b));

    // Display results
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

  } catch (error) {
    console.error('Error analyzing command support:', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  switch (options.command) {
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
      await commandSupportCommand(options.workspacePath, options.commandId);
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
