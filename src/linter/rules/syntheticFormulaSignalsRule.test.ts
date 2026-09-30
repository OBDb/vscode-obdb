import * as jsonc from 'jsonc-parser';
import { SyntheticFormulaSignalsRule } from './syntheticFormulaSignalsRule';

const positionMap = {
  '1': { description: 'Front left', value: 'FL' },
  '2': { description: 'Front right', value: 'FR' },
};

function signalset(synthetics: any[], valueUnit2 = 'psi') {
  return {
    commands: [
      {
        hdr: '750', eax: '2A', cmd: { '22': '2021' }, freq: 86400, signals: [
          { id: 'IS_TID_1', path: 'Tires', name: 'Tire 1 position', fmt: { len: 8, map: positionMap } },
          { id: 'IS_TID_2', path: 'Tires', name: 'Tire 2 position', fmt: { bix: 8, len: 8, map: positionMap } },
        ],
      },
      {
        hdr: '750', eax: '2A', cmd: { '22': '1005' }, freq: 15, signals: [
          { id: 'IS_TP_1', path: 'Tires', name: 'Tire sensor 1 pressure', fmt: { bix: 8, len: 8, max: 56.12, unit: 'psi' } },
          { id: 'IS_TP_2', path: 'Tires', name: 'Tire sensor 2 pressure', fmt: { bix: 24, len: 8, max: 56.12, unit: valueUnit2 } },
        ],
      },
    ],
    synthetics,
  };
}

function select(overrides: any = {}, formula: any = {}) {
  return {
    id: 'IS_TP_FL_SLOT', name: 'Front left tire pressure', path: 'Tires', max: 56.12, unit: 'psi',
    formula: { op: 'select', match: 'FL', cases: { IS_TID_1: 'IS_TP_1', IS_TID_2: 'IS_TP_2' }, ...formula },
    ...overrides,
  };
}

function lint(data: any): string[] {
  const root = jsonc.parseTree(JSON.stringify(data));
  if (!root) {
    throw new Error('fixture did not parse');
  }
  return (new SyntheticFormulaSignalsRule().validateDocument(root) ?? []).map(result => result.message);
}

let failures = 0;
function expect(name: string, messages: string[], expected: string[]) {
  const matches = messages.length === expected.length
    && expected.every(fragment => messages.some(message => message.includes(fragment)));
  if (matches) {
    console.log(`✅ ${name}`);
  } else {
    failures += 1;
    console.error(`❌ ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(messages)}`);
  }
}

expect('A well-formed select passes', lint(signalset([select()])), []);
expect('A select key that is not a signal',
  lint(signalset([select({}, { cases: { IS_TID_9: 'IS_TP_1' } })])),
  ['key IS_TID_9 is not a signal']);
expect('A select value that is not a signal',
  lint(signalset([select({}, { cases: { IS_TID_1: 'IS_TP_9' } })])),
  ['value IS_TP_9 is not a signal']);
expect('A key without a map',
  lint(signalset([select({}, { cases: { IS_TP_2: 'IS_TP_1' } })])),
  ['key IS_TP_2 has no map']);
expect('A match no map has',
  lint(signalset([select({}, { match: 'RR' })])),
  ['no key\'s map has the value "RR"']);
expect('Value signals in different units',
  lint(signalset([select()], 'kPa')),
  ['value signals mix units (kPa, psi)']);
expect('A synthetic unit that differs from its values',
  lint(signalset([select({ unit: 'kPa' })])),
  ['unit is kPa, but its value signals are in psi']);
expect('A ratio reading a missing signal',
  lint(signalset([{ id: 'IS_R', name: 'Ratio', path: 'Tires', max: 2, unit: 'scalar', formula: { op: 'ratio', a: 'IS_TP_1', b: 'IS_TP_9' } }])),
  ['reads IS_TP_9, which no command defines']);
expect('A signalset without synthetics', lint({ commands: [] }), []);

if (failures > 0) {
  process.exitCode = 1;
}
