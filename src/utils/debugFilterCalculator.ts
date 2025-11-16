import { GenerationSet } from './generationsCore';

export interface YearFilter {
  from?: number;
  to?: number;
  years?: number[];
}

/**
 * Helper function to check if a year is allowed by the command filter
 * @param year The year to check
 * @param filter The command filter
 * @returns true if the year is allowed by the filter, false otherwise
 */
function isYearAllowedByFilter(year: number, filter?: YearFilter): boolean {
  if (!filter) {
    return true; // No filter means all years are allowed
  }

  const hasFrom = filter.from !== undefined;
  const hasTo = filter.to !== undefined;
  const hasYears = filter.years !== undefined && filter.years.length > 0;

  // Check if year is in the explicit years list
  if (hasYears && filter.years!.includes(year)) {
    return true;
  }

  // Check if year matches from/to constraints
  if (hasFrom && hasTo) {
    if (filter.to! < filter.from!) {
      // OR condition: year <= to OR year >= from
      return year <= filter.to! || year >= filter.from!;
    } else {
      // AND condition: from <= year <= to
      return year >= filter.from! && year <= filter.to!;
    }
  } else if (hasFrom) {
    // Only from: year >= from
    return year >= filter.from!;
  } else if (hasTo) {
    // Only to: year <= to
    return year <= filter.to!;
  } else if (hasYears) {
    // Only years: must be in the list (already checked above)
    return false;
  }

  return true; // No constraints
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

  // Special case: If command filter has ONLY years (no from/to), the command can ONLY run on those specific years
  if (commandFilter?.years && commandFilter.years.length > 0 && !commandFilter.from && !commandFilter.to) {
    // Command can only run on the specified years
    const allowedYears = new Set(commandFilter.years);
    const validSupportedYears = supported.filter(year => allowedYears.has(year));

    // If all allowed years are supported, no debug filter is needed
    if (validSupportedYears.length === commandFilter.years.length) {
      return {}; // Empty filter means no debugging needed
    }

    // Build a debug filter for the allowed years that are NOT supported
    const unsupportedAllowedYears = commandFilter.years.filter(year => !supported.includes(year));
    if (unsupportedAllowedYears.length > 0) {
      return { years: unsupportedAllowedYears };
    }

    return {}; // No debug filter needed
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
  // Also check that this year is actually allowed by the command filter
  const toYear = minYear - 1;
  if (toYear >= effectiveFirstYear && isYearAllowedByFilter(toYear, commandFilter)) {
    filter.to = toYear;
  }

  // Find years between min and max (exclusive) that are NOT supported
  // This includes both explicitly unsupported years and unknown years
  // We keep unsupported years in the debug filter because the command might work with different configurations
  // Years at the boundaries are covered by "to" and "from"
  // IMPORTANT: Only include years that are actually allowed by the command filter
  const gapYears: number[] = [];
  for (let year = minYear + 1; year < maxYear; year++) {
    if (!supported.includes(year) && isYearAllowedByFilter(year, commandFilter)) {
      gapYears.push(year);
    }
  }

  if (gapYears.length > 0) {
    filter.years = gapYears;
  }

  // "from" is the largest year plus one (but not after latest year if specified)
  // Also check that this year is actually allowed by the command filter
  const fromYear = maxYear + 1;
  if (fromYear <= effectiveLastYear && isYearAllowedByFilter(fromYear, commandFilter)) {
    filter.from = fromYear;
  }

  return filter;
}
