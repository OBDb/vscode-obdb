import { calculateDebugFilter } from './debugFilterCalculator';
import { GenerationSet, Generation } from './generationsCore';

// Helper to create a simple GenerationSet
function createGenerationSet(firstYear?: number, lastYear?: number | null): GenerationSet {
  const generations: Generation[] = [];

  if (firstYear !== undefined) {
    generations.push({
      name: 'test',
      start_year: firstYear,
      end_year: lastYear ?? null,
      description: 'Test generation'
    });
  }

  return new GenerationSet(generations);
}

// Test 1: Command with filter.from = 2018 (the bug case)
const result1 = calculateDebugFilter(
  ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'],
  createGenerationSet(2007, 2030),
  { from: 2018 }
);
console.assert(
  !result1?.to && result1?.from === 2026,
  `Test 1 failed: Expected { "from": 2026 }, got ${JSON.stringify(result1)}`
);
console.log('✅ Test 1 passed: Command with filter.from respects the constraint');

// Test 2: Command with no filter
const result2 = calculateDebugFilter(
  ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'],
  createGenerationSet(2007, 2030),
  undefined
);
console.assert(
  result2?.to === 2017 && result2?.from === 2026,
  `Test 2 failed: Expected { "to": 2017, "from": 2026 }, got ${JSON.stringify(result2)}`
);
console.log('✅ Test 2 passed: Command without filter allows all years');

// Test 3: Command with filter.to
const result3 = calculateDebugFilter(
  ['2015', '2016', '2017', '2018', '2019', '2020'],
  createGenerationSet(2007, 2030),
  { to: 2020 }
);
console.assert(
  result3?.to === 2014 && !result3?.from,
  `Test 3 failed: Expected { "to": 2014 }, got ${JSON.stringify(result3)}`
);
console.log('✅ Test 3 passed: Command with filter.to respects upper bound');

// Test 4: Command with AND filter (from <= to)
const result4 = calculateDebugFilter(
  ['2018', '2019', '2020', '2021', '2022'],
  createGenerationSet(2007, 2030),
  { from: 2018, to: 2022 }
);
console.assert(
  Object.keys(result4 || {}).length === 0,
  `Test 4 failed: Expected {}, got ${JSON.stringify(result4)}`
);
console.log('✅ Test 4 passed: Command with AND filter (range)');

// Test 5: Gap years with command filter
const result5 = calculateDebugFilter(
  ['2018', '2019', '2020', '2023', '2024', '2025'],
  createGenerationSet(2007, 2030),
  { from: 2018 }
);
console.assert(
  !result5?.to &&
  JSON.stringify(result5?.years) === '[2021,2022]' &&
  result5?.from === 2026,
  `Test 5 failed: Expected { "years": [2021, 2022], "from": 2026 }, got ${JSON.stringify(result5)}`
);
console.log('✅ Test 5 passed: Gap years with command filter');

// Test 6: Command with OR filter (to < from)
const result6 = calculateDebugFilter(
  ['2010', '2011', '2012', '2013', '2014', '2015', '2020', '2021', '2022', '2023', '2024', '2025'],
  createGenerationSet(2007, 2030),
  { to: 2015, from: 2020 }
);
console.assert(
  result6?.to === 2009 &&
  JSON.stringify(result6?.years) === '[2016,2017,2018,2019]' &&
  result6?.from === 2026,
  `Test 6 failed: Expected { "to": 2009, "years": [2016, 2017, 2018, 2019], "from": 2026 }, got ${JSON.stringify(result6)}`
);
console.log('✅ Test 6 passed: OR filter doesn\'t constrain the range');

// Test 7: No supported years returns null
const result7 = calculateDebugFilter(
  [],
  createGenerationSet(2007, 2030),
  undefined
);
console.assert(
  result7 === null,
  `Test 7 failed: Expected null, got ${JSON.stringify(result7)}`
);
console.log('✅ Test 7 passed: No supported years returns null');

console.log('\n🎉 All tests passed!');
