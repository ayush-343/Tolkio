// Run after npm ci --prefix frontend. Downloads only the explicitly selected model.
import { prebuiltAppConfig } from '../frontend/node_modules/@mlc-ai/web-llm/lib/index.js';
import { CANDIDATES, RUNTIME_VERSION, validateManifest } from '../shared/ai/contracts.js';
import { createWriteStream } from 'node:fs';
import { mkdir as mkdirAsync, readFile as readFileAsync, writeFile as writeFileAsync, rename as renameAsync, rm as rmAsync } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!CANDIDATES.some(m => m.id === id)) throw new Error(`Choose a model ID: ${CANDIDATES.map(m => m.id).join(', ')}`);
const record = prebuiltAppConfig.model_list.find(m => m.model_id === id);
if (!record) throw new Error('The pinned runtime does not support this model.');
async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  return r;
}
const meta = await (await get(`https://huggingface.co/api/models/mlc-ai/${id}?blobs=true`)).json();
const revision = meta.sha;
const upstream = `https://huggingface.co/mlc-ai/${id}/resolve/${revision}/`;
const config = await (await get(`${upstream}mlc-chat-config.json`)).json();
// WebLLM 0.2.86 consumes tensor-cache.json. Older MLC artifacts may also
// contain ndarray-cache.json; it is not the manifest used by this runtime.
const indexName = 'tensor-cache.json';
const index = await (await get(`${upstream}${indexName}`)).json();
if (!Array.isArray(index.records) || !Array.isArray(config.tokenizer_files)) throw new Error('Unexpected MLC artifact metadata.');
const names = [...new Set(['mlc-chat-config.json', indexName, ...config.tokenizer_files, ...index.records.map(r => r.dataPath)])];
if (names.some(n => !/^[a-zA-Z0-9_.-]+$/.test(n))) throw new Error('Unexpected upstream artifact path.');
const estimated = names.reduce((s, n) => s + (meta.siblings.find(f => f.rfilename === n)?.size || 0), 0);
console.log(JSON.stringify({ id, revision, runtimeVersion: RUNTIME_VERSION, upstreamBytesExcludingWasm: estimated, artifactCount: names.length + 1 }));
if (process.argv.includes('--inspect')) process.exit(0);
const assetRoot = process.env.AI_ASSET_BASE_URL || '/ai-models/';
const baseUrl = /^https:\/\//.test(assetRoot)
  ? new URL(`${id}/${revision}/`, assetRoot.endsWith('/') ? assetRoot : `${assetRoot}/`).href
  : `/${assetRoot.replace(/^\/+|\/+$/g, '')}/${id}/${revision}/`;
const directory = path.join(root, 'frontend/public/ai-models', id, revision);
await mkdirAsync(directory, { recursive: true });
const files = [];
for (const name of [...names, 'model.wasm']) {
  const url = name === 'model.wasm' ? record.model_lib : upstream + name;
  const response = await get(url);
  const temporary = path.join(directory, `${name}.part`);
  const hasher = createHash('sha256');
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body),
    new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; hasher.update(chunk); callback(null, chunk); } }),
    createWriteStream(temporary),
  );
  const sha256 = hasher.digest('hex');
  const upstreamHash = meta.siblings.find(f => f.rfilename === name)?.lfs?.sha256;
  if (upstreamHash && upstreamHash !== sha256) { await rmAsync(temporary, { force: true }); throw new Error(`Upstream hash mismatch: ${name}`); }
  await renameAsync(temporary, path.join(directory, name));
  files.push({ path: name, bytes, sha256 });
  console.log(`Verified ${name}: ${bytes} bytes`);
}
const manifest = validateManifest({ ...CANDIDATES.find(m => m.id === id), revision, baseUrl, upstream, upstreamLibrary: record.model_lib, files, downloadBytes: files.reduce((s, f) => s + f.bytes, 0), requiredFeatures: [...new Set(['shader-f16', ...(record.required_features || [])])], bufferSizeRequired: record.buffer_size_required_bytes || 0 });
const catalogPath = path.join(root, 'frontend/public/ai-models/catalog.json');
let catalog = [];
try { catalog = JSON.parse(await readFileAsync(catalogPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
catalog = [...catalog.filter(m => m.id !== id), manifest];
await writeFileAsync(`${catalogPath}.part`, JSON.stringify(catalog, null, 2));
await renameAsync(`${catalogPath}.part`, catalogPath);
console.log(`Prepared ${id}. Point AI_MANIFEST_PATH at ${catalogPath}. No task approvals were granted.`);
