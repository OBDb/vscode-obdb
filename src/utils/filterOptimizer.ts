import { GenerationSet } from './generationsCore';
import { YearFilter } from './debugFilterCalculator';

/**
 * Calculates the optimized filter based on supported and unsupported years
 * The optimized filter should include years that are:
 * - Confirmed supported, OR
 * - Support is uncertain (not explicitly unsupported)
 *
 * @param supportedYears Array of confirmed supported model years
 * @param unsupportedYears Array of confirmed unsupported model years
 * @param generationSet Generation information for the vehicle
 * @returns Optimized filter, or null if all years are supported
 */
export function calculateOptimizedFilter(
  supportedYears: string[],
  unsupportedYears: string[],
  generationSet: GenerationSet
): YearFilter | null {
  const supported = supportedYears.map(y => parseInt(y, 10)).filter(y => y >= 1996);
  const unsupported = unsupportedYears.map(y => parseInt(y, 10));

  if (supported.length === 0 && unsupported.length === 0) {
    return null; // No information, can't optimize
  }

  const firstYear = generationSet.firstYear ?? 2000;
  const lastYear = generationSet.lastYear ?? new Date().getFullYear() + 5;

  // Build set of all generation years
  const allYears: number[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    allYears.push(year);
  }

  // Find years that should be included in the filter:
  // - Confirmed supported years (1996 or later)
  // - Years that are NOT confirmed unsupported (uncertain years) and are 1996 or later
  const allowedYears = allYears.filter(year =>
    year >= 1996 && (supported.includes(year) || !unsupported.includes(year))
  );

  if (allowedYears.length === allYears.length) {
    // All years are allowed, no filter needed
    return {};
  }

  if (allowedYears.length === 0) {
    // No years are allowed, which shouldn't happen in practice
    return null;
  }

  // Build the most efficient filter representation
  const filter: YearFilter = {};

  const minAllowed = Math.min(...allowedYears);
  const maxAllowed = Math.max(...allowedYears);

  // Check if we can use a simple "from" filter
  if (allowedYears.every(year => year >= minAllowed)) {
    const expectedYears = [];
    for (let year = minAllowed; year <= lastYear; year++) {
      expectedYears.push(year);
    }
    if (JSON.stringify(allowedYears.sort()) === JSON.stringify(expectedYears.sort())) {
      filter.from = minAllowed;
      return filter;
    }
  }

  // Check if we can use a simple "to" filter
  if (allowedYears.every(year => year <= maxAllowed)) {
    const expectedYears = [];
    for (let year = firstYear; year <= maxAllowed; year++) {
      expectedYears.push(year);
    }
    if (JSON.stringify(allowedYears.sort()) === JSON.stringify(expectedYears.sort())) {
      filter.to = maxAllowed;
      return filter;
    }
  }

  // Check if we can use a "from/to" range
  const rangeYears = [];
  for (let year = minAllowed; year <= maxAllowed; year++) {
    rangeYears.push(year);
  }
  if (JSON.stringify(allowedYears.sort()) === JSON.stringify(rangeYears)) {
    if (minAllowed === firstYear && maxAllowed === lastYear) {
      return {}; // All years, no filter needed
    }
    filter.from = minAllowed;
    filter.to = maxAllowed;
    return filter;
  }

  // Check if we can use an OR condition (to < from)
  // Find contiguous range from the beginning
  let toYear: number | undefined;
  for (let year = firstYear; year <= lastYear; year++) {
    if (allowedYears.includes(year)) {
      toYear = year;
    } else {
      break;
    }
  }

  // Find contiguous range from the end
  let fromYear: number | undefined;
  for (let year = lastYear; year >= firstYear; year--) {
    if (allowedYears.includes(year)) {
      fromYear = year;
    } else {
      break;
    }
  }

  // Find individual years in the middle
  const middleYears = allowedYears.filter(year => {
    if (toYear !== undefined && year <= toYear) return false;
    if (fromYear !== undefined && year >= fromYear) return false;
    return true;
  });

  // Build the filter
  if (toYear !== undefined && toYear >= firstYear) {
    filter.to = toYear;
  }
  if (fromYear !== undefined && fromYear <= lastYear) {
    filter.from = fromYear;
  }
  if (middleYears.length > 0) {
    filter.years = middleYears.sort((a, b) => a - b);
  }

  // If the filter is empty, return null
  if (Object.keys(filter).length === 0) {
    return null;
  }

  return filter;
}
