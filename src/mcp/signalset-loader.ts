import * as fs from 'fs';
import * as path from 'path';
import { Command, Signal } from '../types';

export interface Signalset {
  path: string;
  name: string;
  commands: Command[];
}

export interface SignalsetSummary {
  path: string;
  name: string;
  commandCount: number;
  signalCount: number;
}

/**
 * Loads a signalset from a JSON file
 * @param signalsetPath Absolute path to the signalset JSON file
 * @returns Parsed signalset object
 */
export async function loadSignalset(signalsetPath: string): Promise<Signalset> {
  const content = await fs.promises.readFile(signalsetPath, 'utf-8');
  const parsed = JSON.parse(content);

  return {
    path: signalsetPath,
    name: path.basename(signalsetPath, '.json'),
    commands: parsed.commands || []
  };
}

/**
 * Lists all available signalsets in a workspace
 * @param workspaceRoot Root path of the workspace
 * @returns Array of signalset summaries
 */
export async function listSignalsets(workspaceRoot: string): Promise<SignalsetSummary[]> {
  const signalsetsPath = path.join(workspaceRoot, 'signalsets', 'v3');
  const summaries: SignalsetSummary[] = [];

  try {
    const files = await fs.promises.readdir(signalsetsPath);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const fullPath = path.join(signalsetsPath, file);
      try {
        const signalset = await loadSignalset(fullPath);
        const signalCount = signalset.commands.reduce((sum, cmd) => {
          return sum + (cmd.signals?.length || 0);
        }, 0);

        summaries.push({
          path: fullPath,
          name: signalset.name,
          commandCount: signalset.commands.length,
          signalCount
        });
      } catch (err) {
        console.error(`Error loading signalset ${file}:`, err);
      }
    }
  } catch (err) {
    console.error('Error listing signalsets:', err);
  }

  return summaries;
}

/**
 * Gets all signals from a signalset
 * @param signalset The signalset to extract signals from
 * @returns Array of all signals with their command context
 */
export function getAllSignals(signalset: Signalset): Array<Signal & { commandId: string }> {
  const signals: Array<Signal & { commandId: string }> = [];

  for (const command of signalset.commands) {
    if (!command.signals) {
      continue;
    }

    const commandId = createCommandId(command);

    for (const signal of command.signals) {
      // Extract bitOffset and bitLength from fmt if not directly present
      const bitOffset = signal.bitOffset !== undefined ? signal.bitOffset : (signal as any).fmt?.bix;
      const bitLength = signal.bitLength !== undefined ? signal.bitLength : (signal as any).fmt?.len;

      signals.push({
        ...signal,
        bitOffset,
        bitLength,
        commandId
      });
    }
  }

  return signals;
}

/**
 * Creates a command ID from a command object
 * @param command The command object
 * @returns Command ID string (e.g., "7E0.7E8.221100")
 */
export function createCommandId(command: Command): string {
  let cmdStr = '';

  if (typeof command.cmd === 'object' && command.cmd !== null) {
    const key = Object.keys(command.cmd)[0];
    const value = command.cmd[key];
    cmdStr = `${key}${value}`;
  } else if (typeof command.cmd === 'string') {
    cmdStr = command.cmd;
  }

  if (command.rax) {
    return `${command.hdr}.${command.rax}.${cmdStr}`;
  }

  return `${command.hdr}.${cmdStr}`;
}

/**
 * Finds a command by ID in a signalset
 * @param signalset The signalset to search
 * @param commandId The command ID to find
 * @returns The command object if found, undefined otherwise
 */
export function findCommandById(signalset: Signalset, commandId: string): Command | undefined {
  return signalset.commands.find(cmd => {
    const id = createCommandId(cmd);
    return id === commandId || id === stripReceiveFilter(commandId);
  });
}

/**
 * Strips the receive filter (middle part) from a command ID if present
 * @param commandId The command ID
 * @returns Simplified command ID
 */
function stripReceiveFilter(commandId: string): string {
  const parts = commandId.split('.');
  if (parts.length === 3) {
    return `${parts[0]}.${parts[2]}`;
  }
  return commandId;
}

/**
 * Validates a signalset for common issues
 * @param signalset The signalset to validate
 * @returns Array of validation errors
 */
export function validateSignalset(signalset: Signalset): string[] {
  const errors: string[] = [];
  const seenSignalIds = new Set<string>();

  for (const command of signalset.commands) {
    const commandId = createCommandId(command);

    if (!command.hdr) {
      errors.push(`Command missing header (hdr)`);
    }

    if (!command.cmd) {
      errors.push(`Command ${commandId} missing cmd`);
    }

    if (command.signals) {
      for (const signal of command.signals) {
        if (!signal.id) {
          errors.push(`Command ${commandId} has signal without id`);
          continue;
        }

        if (seenSignalIds.has(signal.id)) {
          errors.push(`Duplicate signal ID: ${signal.id}`);
        }
        seenSignalIds.add(signal.id);

        if (signal.bitOffset === undefined) {
          errors.push(`Signal ${signal.id} missing bitOffset`);
        }

        if (signal.bitLength === undefined) {
          errors.push(`Signal ${signal.id} missing bitLength`);
        }

        if (!signal.name) {
          errors.push(`Signal ${signal.id} missing name`);
        }
      }

      // Check for bit overlaps within command
      const bitOverlaps = findBitOverlaps(command.signals);
      for (const overlap of bitOverlaps) {
        errors.push(
          `Bit overlap in command ${commandId}: signals ${overlap.signal1} and ${overlap.signal2} overlap at bits ${overlap.start}-${overlap.end}`
        );
      }
    }
  }

  return errors;
}

/**
 * Finds bit overlaps between signals
 * @param signals Array of signals to check
 * @returns Array of overlap descriptions
 */
function findBitOverlaps(signals: Signal[]): Array<{
  signal1: string;
  signal2: string;
  start: number;
  end: number;
}> {
  const overlaps: Array<{
    signal1: string;
    signal2: string;
    start: number;
    end: number;
  }> = [];

  for (let i = 0; i < signals.length; i++) {
    const sig1 = signals[i];
    const sig1End = sig1.bitOffset + sig1.bitLength - 1;

    for (let j = i + 1; j < signals.length; j++) {
      const sig2 = signals[j];
      const sig2End = sig2.bitOffset + sig2.bitLength - 1;

      // Check if ranges overlap
      const overlapStart = Math.max(sig1.bitOffset, sig2.bitOffset);
      const overlapEnd = Math.min(sig1End, sig2End);

      if (overlapStart <= overlapEnd) {
        overlaps.push({
          signal1: sig1.id,
          signal2: sig2.id,
          start: overlapStart,
          end: overlapEnd
        });
      }
    }
  }

  return overlaps;
}
