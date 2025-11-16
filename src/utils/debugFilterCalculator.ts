import { GenerationSet } from './generationsCore';

export interface YearFilter {
  from?: number;
  to?: number;
  years?: number[];
}

/**
 * Calculates the debug filter based on supported years
 * Returns null if the command should have "dbg": true instead
 * @param supportedYears Array of supported model years
 * @param generationSet Generation information for the vehicle
 * @param commandFilter The command's own filter constraints (if any)
 */
export function calculateDebugFilter(
  supportedYears: string[],
  generationSet: GenerationSet,
  commandFilter?: YearFilter
): YearFilter | null {
  const supported = supportedYears.map(y => parseInt(y, 10));

  // Only use supported years to determine the bounds of the filter
  // Unsupported years don't give us definitive information - they just mean
  // the command doesn't work with the current configuration
  if (supported.length === 0) {
    return null;
  }

  let minYear = Math.min(...supported);
  let maxYear = Math.max(...supported);

  // Determine the effective year range based on command filter semantics
  // If commandFilter has both from and to:
  //   - If to < from: OR condition (years <= to OR years >= from) - cannot determine a single range
  //   - If from <= to: AND condition (years from..to) - this is a range
  let effectiveFirstYear = generationSet.firstYear ?? -Infinity;
  let effectiveLastYear = generationSet.lastYear ?? Infinity;

  if (commandFilter) {
    const hasFrom = commandFilter.from !== undefined;
    const hasTo = commandFilter.to !== undefined;

    if (hasFrom && hasTo) {
      // Both from and to are specified
      if (commandFilter.to! < commandFilter.from!) {
        // OR condition: years <= to OR years >= from
        // Cannot determine a single contiguous range, so we can't use this for constraining
        // The command can work in multiple disjoint ranges
        // For now, don't constrain based on command filter in this case
      } else {
        // AND condition: years from..to (a range)
        effectiveFirstYear = Math.max(effectiveFirstYear, commandFilter.from!);
        effectiveLastYear = Math.min(effectiveLastYear, commandFilter.to!);
      }
    } else if (hasFrom) {
      // Only from: years >= from
      effectiveFirstYear = Math.max(effectiveFirstYear, commandFilter.from!);
    } else if (hasTo) {
      // Only to: years <= to
      effectiveLastYear = Math.min(effectiveLastYear, commandFilter.to!);
    }
  }

  if (minYear < effectiveFirstYear) {
    minYear = effectiveFirstYear;
  }
  if (maxYear > effectiveLastYear) {
    maxYear = effectiveLastYear;
  }

  // Build the filter
  const filter: YearFilter = {};

  // "to" is the smallest year minus one (but not before earliest year if specified)
  const toYear = minYear - 1;
  if (toYear >= effectiveFirstYear) {
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
  if (fromYear <= effectiveLastYear) {
    filter.from = fromYear;
  }

  return filter;
}
