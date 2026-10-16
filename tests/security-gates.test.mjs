import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const gate = new URL('../scripts/check-codeql-results.mjs', import.meta.url);
function run(report) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'talkio-sarif-'));
  try {
    if (report) writeFileSync(path.join(directory, 'results.sarif'), JSON.stringify(report));
    return spawnSync(process.execPath, [gate.pathname, directory], { encoding: 'utf8' }).status;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const report = severity => ({ version: '2.1.0', runs: [{ tool: { driver: { rules: [{ id: 'security-rule', properties: { 'security-severity': String(severity) } }] } }, results: [{ ruleId: 'security-rule', level: 'warning' }] }] });
test('code security gate blocks high findings and accepts lower severity reports', () => {
  assert.equal(run(report(7)), 1);
  assert.equal(run(report(9)), 1);
  assert.equal(run(report(4)), 0);
});
test('code security gate rejects missing or malformed analysis rather than passing silently', () => {
  assert.notEqual(run(null), 0);
  assert.notEqual(run({ version: '2.1.0', runs: [] }), 0);
  const incomplete = report(9); incomplete.runs[0].tool.driver.rules = [];
  assert.notEqual(run(incomplete), 0);
});
