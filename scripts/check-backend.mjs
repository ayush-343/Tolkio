import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(name) : /\.(mjs|js)$/.test(name) ? [name] : [];
  });
}
const files = ['backend/src', 'shared', 'scripts'].flatMap(sources);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || `Syntax check failed: ${file}`);
    process.exit(1);
  }
}
console.log(`Backend/shared/tool syntax: ${files.length} files passed.`);
