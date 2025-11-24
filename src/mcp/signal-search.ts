import { Signal } from '../types';
import { Signalset, getAllSignals, loadSignalset } from './signalset-loader';

export interface SignalSearchOptions {
  pattern?: string;        // Regex pattern to match signal ID or name
  path?: string;           // Filter by signal path
  metric?: string;         // Filter by suggestedMetric
  commandId?: string;      // Filter by command ID
  minBitLength?: number;   // Minimum bit length
  maxBitLength?: number;   // Maximum bit length
}

export interface SignalSearchResult extends Signal {
  commandId: string;
  signalsetName: string;
}

/**
 * Searches for signals matching the given criteria
 * @param signalset The signalset to search
 * @param options Search options
 * @returns Array of matching signals
 */
export function searchSignals(
  signalset: Signalset,
  options: SignalSearchOptions
): SignalSearchResult[] {
  const allSignals = getAllSignals(signalset);
  const results: SignalSearchResult[] = [];

  const pattern = options.pattern ? new RegExp(options.pattern, 'i') : null;

  for (const signal of allSignals) {
    // Apply filters
    if (pattern) {
      const matchesId = pattern.test(signal.id);
      const matchesName = pattern.test(signal.name);
      if (!matchesId && !matchesName) {
        continue;
      }
    }

    if (options.path && signal.path !== options.path) {
      continue;
    }

    if (options.metric && signal.suggestedMetric !== options.metric) {
      continue;
    }

    if (options.commandId && signal.commandId !== options.commandId) {
      continue;
    }

    if (options.minBitLength !== undefined && signal.bitLength < options.minBitLength) {
      continue;
    }

    if (options.maxBitLength !== undefined && signal.bitLength > options.maxBitLength) {
      continue;
    }

    results.push({
      ...signal,
      signalsetName: signalset.name
    });
  }

  return results;
}

/**
 * Groups signals by their path
 * @param signals Array of signals
 * @returns Map of path to signals
 */
export function groupSignalsByPath(signals: SignalSearchResult[]): Map<string, SignalSearchResult[]> {
  const groups = new Map<string, SignalSearchResult[]>();

  for (const signal of signals) {
    const path = signal.path || '(no path)';
    if (!groups.has(path)) {
      groups.set(path, []);
    }
    groups.get(path)!.push(signal);
  }

  return groups;
}

/**
 * Groups signals by their suggested metric
 * @param signals Array of signals
 * @returns Map of metric to signals
 */
export function groupSignalsByMetric(signals: SignalSearchResult[]): Map<string, SignalSearchResult[]> {
  const groups = new Map<string, SignalSearchResult[]>();

  for (const signal of signals) {
    const metric = signal.suggestedMetric || '(no metric)';
    if (!groups.has(metric)) {
      groups.set(metric, []);
    }
    groups.get(metric)!.push(signal);
  }

  return groups;
}

/**
 * Gets all unique paths in a signalset
 * @param signalset The signalset to analyze
 * @returns Array of unique paths
 */
export function getUniquePaths(signalset: Signalset): string[] {
  const paths = new Set<string>();

  for (const signal of getAllSignals(signalset)) {
    if (signal.path) {
      paths.add(signal.path);
    }
  }

  return Array.from(paths).sort();
}

/**
 * Gets all unique suggested metrics in a signalset
 * @param signalset The signalset to analyze
 * @returns Array of unique metrics
 */
export function getUniqueMetrics(signalset: Signalset): string[] {
  const metrics = new Set<string>();

  for (const signal of getAllSignals(signalset)) {
    if (signal.suggestedMetric) {
      metrics.add(signal.suggestedMetric);
    }
  }

  return Array.from(metrics).sort();
}

/**
 * Finds signals by exact ID match
 * @param signalset The signalset to search
 * @param signalId The signal ID to find
 * @returns Array of matching signals (can be multiple if signal appears in multiple commands)
 */
export function findSignalById(signalset: Signalset, signalId: string): SignalSearchResult[] {
  return searchSignals(signalset, {}).filter(s => s.id === signalId);
}

/**
 * Gets statistics about signals in a signalset
 * @param signalset The signalset to analyze
 * @returns Statistics object
 */
export function getSignalStats(signalset: Signalset): {
  totalSignals: number;
  uniqueSignalIds: number;
  signalsWithPath: number;
  signalsWithMetric: number;
  averageBitLength: number;
  pathCount: number;
  metricCount: number;
} {
  const allSignals = getAllSignals(signalset);
  const uniqueIds = new Set(allSignals.map(s => s.id));
  const signalsWithPath = allSignals.filter(s => s.path).length;
  const signalsWithMetric = allSignals.filter(s => s.suggestedMetric).length;
  const totalBitLength = allSignals.reduce((sum, s) => sum + s.bitLength, 0);

  return {
    totalSignals: allSignals.length,
    uniqueSignalIds: uniqueIds.size,
    signalsWithPath,
    signalsWithMetric,
    averageBitLength: allSignals.length > 0
      ? Math.round((totalBitLength / allSignals.length) * 10) / 10
      : 0,
    pathCount: getUniquePaths(signalset).length,
    metricCount: getUniqueMetrics(signalset).length
  };
}

/**
 * Formats signal search results as a readable string
 * @param results Array of signal results
 * @param includeDetails Whether to include full details
 * @returns Formatted string
 */
export function formatSignalResults(results: SignalSearchResult[], includeDetails: boolean = false): string {
  if (results.length === 0) {
    return 'No signals found.';
  }

  const lines: string[] = [`Found ${results.length} signal(s):\n`];

  for (const signal of results) {
    if (includeDetails) {
      lines.push(`  ${signal.id} (${signal.name})`);
      lines.push(`    Command: ${signal.commandId}`);
      lines.push(`    Signalset: ${signal.signalsetName}`);
      lines.push(`    Bits: ${signal.bitOffset}-${signal.bitOffset + signal.bitLength - 1} (length: ${signal.bitLength})`);
      if (signal.path) {
        lines.push(`    Path: ${signal.path}`);
      }
      if (signal.suggestedMetric) {
        lines.push(`    Metric: ${signal.suggestedMetric}`);
      }
      lines.push('');
    } else {
      const location = signal.path ? ` [${signal.path}]` : '';
      const metric = signal.suggestedMetric ? ` → ${signal.suggestedMetric}` : '';
      lines.push(`  ${signal.id}${location}${metric}`);
    }
  }

  return lines.join('\n');
}
