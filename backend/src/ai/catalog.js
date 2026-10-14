import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATES, validateManifest, LANGUAGES } from '../../../shared/ai/contracts.js';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export function catalog() {
  let prepared = [];
  if (process.env.AI_MANIFEST_PATH) {
    const manifestPath = path.isAbsolute(process.env.AI_MANIFEST_PATH) ? process.env.AI_MANIFEST_PATH : path.resolve(repositoryRoot, process.env.AI_MANIFEST_PATH);
    prepared = JSON.parse(readFileSync(manifestPath, 'utf8')).map(validateManifest);
  }
  return CANDIDATES.map(c => ({ ...c, ...prepared.find(m => m.id === c.id), available: prepared.some(m => m.id === c.id) }));
}
export function canBenchmark(userId) {
  return (process.env.AI_BENCHMARK_USERS || '').split(',').map(s => s.trim()).includes(String(userId));
}
export function serverEnabled() {
  return process.env.AI_SERVER_ENABLED === 'true' && !!process.env.OPENAI_API_KEY && !!process.env.AI_SERVER_MODEL && Number(process.env.AI_DAILY_REQUEST_LIMIT) > 0;
}
export function capabilities(userId) {
  return { languages: LANGUAGES, local: catalog().some(model => model.available), benchmark: canBenchmark(userId), server: serverEnabled() && canBenchmark(userId), serverModel: serverEnabled() ? process.env.AI_SERVER_MODEL : null, serverApprovals: [], maxInputCharacters: 2000, maxOutputTokens: 256 };
}
