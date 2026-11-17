import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getSupportedModelYearsForCommand } from './commandSupportUtils';
import { CommandSupportCache } from '../caches/commands/commandSupportCache';

const fixtureName = '6F1.612.224436|e=12,fc=1.yaml';

function writeYear(root: string, year: string, options: { expectedValues?: any[], supported?: boolean }) {
  const yearDir = path.join(root, 'tests', 'test_cases', year);
  fs.mkdirSync(path.join(yearDir, 'commands'), { recursive: true });
  if (options.expectedValues) {
    const testCases = options.expectedValues
      .map((value, index) => `- expected_values:\n    3SERIES_4436: ${value === null ? 'null' : value}\n  response: 612F10562443600${index}0\n`)
      .join('');
    fs.writeFileSync(
      path.join(yearDir, 'commands', fixtureName),
      `command_id: 6F1.612.224436|e=12,fc=1\ntest_cases:\n${testCases}`
    );
  }
  if (options.supported) {
    fs.writeFileSync(
      path.join(yearDir, 'command_support.yaml'),
      `model_year: ${year}\nsupported_commands_by_ecu:\n  "6F1":\n  - 6F1.612.224436|e=12,fc=1:3SERIES_4436\n`
    );
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-support-'));
  try {
    writeYear(root, '2016', { expectedValues: [1001, 5000], supported: true });
    writeYear(root, '2019', { expectedValues: [null, 3019], supported: true });
    writeYear(root, '2020', { supported: true });
    writeYear(root, '2021', { expectedValues: [null, null], supported: true });
    writeYear(root, '2022', {});

    const supported = await getSupportedModelYearsForCommand('6F1.612.224436', root, new CommandSupportCache());
    const expected = ['2016', '2019', '2020'];
    if (JSON.stringify([...supported].sort()) === JSON.stringify(expected)) {
      console.log('✅ A year counts as supported only when a reply decoded to a value, or it has no fixture but command_support.yaml lists it');
    } else {
      console.error(`❌ Expected supported years ${JSON.stringify(expected)}, got ${JSON.stringify(supported)}`);
      process.exitCode = 1;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
