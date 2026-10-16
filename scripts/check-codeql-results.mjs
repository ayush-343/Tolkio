import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const directory = process.argv[2] || 'sarif';
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith('.sarif') ? [path.join(dir, entry.name)] : []); }
const reports = files(directory);
if (!reports.length) throw new Error('CodeQL did not produce a SARIF report.');
let blocking = 0;
for (const file of reports) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (report.version !== '2.1.0' || !Array.isArray(report.runs) || !report.runs.length) throw new Error('Invalid CodeQL SARIF report.');
  for (const run of report.runs) {
    if (!run.tool?.driver || !Array.isArray(run.results)) throw new Error('Incomplete CodeQL SARIF run.');
    const components = [run.tool.driver, ...(run.tool.extensions || [])];
    const rules = new Map(components.flatMap(component => component.rules || []).map(rule => [rule.id, rule]));
    for (const result of run.results) {
      const rule = rules.get(result.ruleId || result.rule?.id);
      if (!rule) throw new Error('CodeQL finding has no rule metadata.');
      const severity = Number(rule.properties?.['security-severity']);
      if (severity >= 7 || result.level === 'error') {
        blocking++;
        const location = result.locations?.[0]?.physicalLocation;
        console.error(`${rule.id}: blocking finding at ${location?.artifactLocation?.uri || 'unknown'}:${location?.region?.startLine || 1}`);
      }
    }
  }
}
console.log(`CodeQL: ${reports.length} report(s), ${blocking} blocking high/critical or error finding(s).`);
if (blocking) process.exitCode = 1;
