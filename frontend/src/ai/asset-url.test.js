import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCachedAsset } from './asset-url.js';
const origin = 'https://talkio.example';
const manifest = { baseUrl: '/ai-models/qwen/revision/', files: [{ path: 'mlc-chat-config.json' }, { path: 'model.wasm' }] };
test('WebLLM resolve/main aliases read the canonical downloaded artifact', () => {
  for (const suffix of ['mlc-chat-config.json', 'resolve/main/mlc-chat-config.json']) {
    const result = resolveCachedAsset(new Request(origin + manifest.baseUrl + suffix), manifest, origin);
    assert.equal(result.url.href, origin + manifest.baseUrl + 'mlc-chat-config.json');
  }
  assert.equal(resolveCachedAsset(new URL(origin + manifest.baseUrl + 'model.wasm'), manifest, origin).file.path, 'model.wasm');
});
test('unexpected model URLs cannot trigger a network fallback', () => {
  assert.throws(() => resolveCachedAsset('https://other.example/mlc-chat-config.json', manifest, origin));
  assert.throws(() => resolveCachedAsset(origin + manifest.baseUrl + 'resolve/main/unknown.json', manifest, origin));
});
