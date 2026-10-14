import { validateTask } from '../../../shared/ai/contracts.js';

export function parseBenchmarkSuite(raw) {
  const value = JSON.parse(raw);
  const cases = Array.isArray(value) ? value : value?.cases;
  if (!Array.isArray(cases) || cases.length < 50 || cases.length > 500) throw new Error('Add between 50 and 500 cases to the JSON suite.');
  const ids = new Set();
  return cases.map((item, index) => {
    const request = validateTask({ ...item, execution: 'local' });
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `case-${index + 1}`;
    if (id.length > 80 || ids.has(id)) throw new Error(`Case ${index + 1} has an invalid or repeated ID.`);
    ids.add(id);
    for (const field of ['expectedOutput', 'baselineOutput']) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 6000)) throw new Error(`Case ${id} has an invalid ${field}.`);
    }
    return { ...request, id, expectedOutput: item.expectedOutput || '', baselineOutput: item.baselineOutput || '' };
  });
}

export function groupBenchmarkCases(cases) {
  const groups = new Map();
  for (const item of cases) {
    const key = `${item.task}:${item.sourceLanguage}>${item.targetLanguage}`;
    if (!groups.has(key)) groups.set(key, { key, task: item.task, sourceLanguage: item.sourceLanguage, targetLanguage: item.targetLanguage, cases: [] });
    groups.get(key).cases.push(item);
  }
  return [...groups.values()];
}

export function summarizeBenchmark(results) {
  const completeReviews = results.filter((item) => item.verdict && (!item.baselineOutput || item.baselineVerdict));
  const baselineReviewed = results.filter((item) => item.baselineOutput && item.baselineVerdict);
  const acceptance = completeReviews.length ? completeReviews.filter((item) => item.verdict === 'pass').length / completeReviews.length : null;
  const baselineAcceptance = baselineReviewed.length ? baselineReviewed.filter((item) => item.baselineVerdict === 'pass').length / baselineReviewed.length : null;
  const completion = results.map((item) => item.completionMs).filter(Number.isFinite).sort((a, b) => a - b);
  const firstToken = results.map((item) => item.firstTokenMs).filter(Number.isFinite).sort((a, b) => a - b);
  const p95 = values => values.length ? values[Math.ceil(values.length * 0.95) - 1] : null;
  return {
    cases: results.length,
    reviewed: completeReviews.length,
    acceptance,
    baselineReviewed: baselineReviewed.length,
    baselineAcceptance,
    acceptanceDelta: acceptance !== null && baselineAcceptance !== null ? acceptance - baselineAcceptance : null,
    p95FirstTokenMs: p95(firstToken),
    p95CompletionMs: p95(completion),
    passed: results.length >= 50 && completeReviews.length === results.length && acceptance >= 0.9
      && baselineReviewed.length === results.length && acceptance - baselineAcceptance >= -0.05
      && p95(firstToken) < 5000 && p95(completion) < 30000,
  };
}
