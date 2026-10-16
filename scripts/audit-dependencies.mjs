import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
mkdirSync('.security-reports', { recursive: true });
let failed = false;
const summary = ['## Dependency security', '', '| Package | Runtime high/critical | Full dependency high/critical |', '|---|---:|---:|'];
for (const project of ['backend', 'frontend']) {
  const results = {};
  for (const scope of ['runtime', 'all']) {
    const args = ['audit', '--prefix', project, '--package-lock-only', '--json', scope === 'runtime' ? '--omit=dev' : '--include=dev'];
    const auditProcess = spawnSync('npm', args, { encoding: 'utf8', timeout: 120000 });
    let report;
    try { report = JSON.parse(auditProcess.stdout); } catch { failed = true; console.error(`Could not read ${project} ${scope} audit.`); continue; }
    writeFileSync(`.security-reports/${project}-${scope}.json`, JSON.stringify(report, null, 2));
    if (report.error || !report.metadata?.vulnerabilities) { failed = true; console.error(`The registry could not audit ${project} ${scope}.`); continue; }
    results[scope] = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
  }
  summary.push(`| ${project} | ${results.runtime ?? 'unavailable'} | ${results.all ?? 'unavailable'} |`);
  if (results.runtime !== 0) failed = true;
  if (results.all > 0) console.warn(`${project}: build/development advisories remain visible in the full audit report.`);
}
summary.push('', 'Runtime high/critical advisories block this check. Full development/build reports are retained; pull-request dependency review also checks newly introduced high/critical development advisories.');
console.log(summary.join('\n'));
if (globalThis.process.env.GITHUB_STEP_SUMMARY) appendFileSync(globalThis.process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
if (failed) globalThis.process.exitCode = 1;
