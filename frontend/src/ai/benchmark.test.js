import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBenchmarkCases, parseBenchmarkSuite, summarizeBenchmark } from './benchmark.js';

const cases = Array.from({ length: 50 }, (_, i) => ({ id: `fr-${i}`, task: 'translate', input: `hello ${i}`, sourceLanguage: 'en', targetLanguage: 'fr', level: 'A2', baselineOutput: 'bonjour' }));

test('benchmark suite validates and groups cases by task and translation direction', () => {
  const parsed = parseBenchmarkSuite(JSON.stringify(cases));
  assert.equal(parsed.length, 50);
  assert.equal(groupBenchmarkCases(parsed)[0].key, 'translate:en>fr');
  assert.throws(() => parseBenchmarkSuite(JSON.stringify(cases.slice(0, 49))), /between 50 and 500/);
  assert.throws(() => parseBenchmarkSuite(JSON.stringify([cases[0], { ...cases[1], id: cases[0].id }, ...cases.slice(2)])), /repeated ID/);
});

test('acceptance gate requires reviewed non-inferior results and performance targets', () => {
  const passing = cases.map((item, i) => ({ id: item.id, baselineOutput: item.baselineOutput, verdict: i < 47 ? 'pass' : 'fail', baselineVerdict: i < 45 ? 'pass' : 'fail', firstTokenMs: 1000, completionMs: 4000 }));
  assert.equal(summarizeBenchmark(passing).passed, true);
  assert.equal(summarizeBenchmark(passing.slice(0, 49)).passed, false);
  assert.equal(summarizeBenchmark(passing.map((item, i) => ({ ...item, verdict: i < 40 ? 'pass' : 'fail' }))).passed, false);
});
