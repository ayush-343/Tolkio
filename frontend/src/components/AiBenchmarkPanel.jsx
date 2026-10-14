import { useMemo, useRef, useState } from "react";
import { Download, FileUp, Play, Square } from "lucide-react";
import { parseBenchmarkSuite, groupBenchmarkCases, summarizeBenchmark } from "../ai/benchmark";
import { localRuntime } from "../ai/runtime";
import { runTask } from "../ai/router";

function downloadJson(fileName, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AiBenchmarkPanel({ model, enabled }) {
  const [cases, setCases] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [reports, setReports] = useState({});
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const controller = useRef(null);
  const groups = useMemo(() => groupBenchmarkCases(cases), [cases]);
  const group = groups.find((item) => item.key === selectedGroup) || groups[0];
  const reportKey = model && group ? `${model.id}::${group.key}` : "";
  const activeReport = reports[reportKey] || null;
  const summary = activeReport ? summarizeBenchmark(activeReport.results) : null;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError(""); setReports({});
    if (!file) return;
    if (file.size > 2_000_000) { setError("Benchmark files must be 2 MB or smaller."); return; }
    try {
      const parsed = parseBenchmarkSuite(await file.text());
      const nextGroups = groupBenchmarkCases(parsed);
      setCases(parsed);
      setSelectedGroup(nextGroups[0]?.key || "");
    } catch (cause) { setError(cause.message || "Could not read this benchmark suite."); }
  };

  const runSuite = async () => {
    setError("");
    if (!enabled || !model || !group || group.cases.length < 50) return;
    setWorking(true);
    controller.current = new AbortController();
    const results = [];
    try {
      if (localRuntime.manifest?.id !== model.id) {
        setProgress("Loading the selected model into this device…");
        await localRuntime.load(model, ({ progress: value }) => setProgress(`Loading model… ${Math.round((value || 0) * 100)}%`), controller.current.signal);
      }
      const batch = group.cases.slice(0, 50);
      for (let index = 0; index < batch.length; index++) {
        controller.current.signal.throwIfAborted();
        setProgress(`Running case ${index + 1} of 50 on this device…`);
        const item = batch[index];
        const result = await runTask({ ...item, execution: "local" }, { benchmark: true, signal: controller.current.signal });
        results.push({
          id: item.id,
          expectedOutput: item.expectedOutput,
          baselineOutput: item.baselineOutput,
          output: result.output,
          firstTokenMs: result.metrics?.firstTokenMs,
          completionMs: result.metrics?.completionMs,
          verdict: null,
          baselineVerdict: null,
        });
        setReports((previous) => ({ ...previous, [reportKey]: { modelId: model.id, modelVersion: result.modelVersion, groupKey: group.key, results: [...results] } }));
      }
      setProgress("All 50 cases completed locally. Review each output against its reference and baseline.");
    } catch (cause) {
      setError(cause.message || "Benchmark stopped before completion.");
      if (results.length) setReports((previous) => ({ ...previous, [reportKey]: { modelId: model.id, modelVersion: model.revision, groupKey: group.key, results: [...results] } }));
    } finally { setWorking(false); controller.current = null; }
  };

  const stop = () => {
    controller.current?.abort(new Error("Benchmark cancelled."));
    localRuntime.release("The benchmark was cancelled.");
  };

  const mark = (index, key, value) => setReports((previous) => {
    const current = previous[reportKey];
    if (!current) return previous;
    const results = current.results.map((item, i) => i === index ? { ...item, [key]: value } : item);
    return { ...previous, [reportKey]: { ...current, results } };
  });

  return (
    <section aria-labelledby="benchmark-heading" className="rounded-2xl border border-base-300 bg-base-200 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 id="benchmark-heading" className="text-lg font-semibold">Review a 50 case benchmark</h2><p className="mt-1 max-w-[68ch] text-sm leading-5 text-base-content/65">Import a local JSON suite, run one task and language direction, then compare model answers with a higher precision baseline. Prompts never leave this device.</p></div>
        <label className="btn btn-outline btn-sm shrink-0"><FileUp size={15} aria-hidden="true" /> Choose JSON suite<input className="sr-only" type="file" accept="application/json,.json" onChange={handleFile} disabled={working} /></label>
      </div>

      <div className="mt-4 rounded-lg bg-base-100 p-3 text-xs leading-5 text-base-content/65">Suite format: an array of 50–500 cases with `id`, `task`, `input`, `sourceLanguage`, `targetLanguage`, and `level`. Add `expectedOutput` and `baselineOutput` to support human review. Each task and language direction needs at least 50 cases; the first 50 are used per run.</div>
      {cases.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="form-control"><span className="label-text mb-2 font-medium">Benchmark group ({cases.length} cases loaded)</span><select className="select select-bordered bg-base-100" value={group?.key || ""} onChange={(event) => setSelectedGroup(event.target.value)} disabled={working}>{groups.map((item) => <option key={item.key} value={item.key}>{item.task} · {item.sourceLanguage.toUpperCase()} → {item.targetLanguage.toUpperCase()} · {item.cases.length} cases</option>)}</select></label>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={runSuite} disabled={working || !enabled || !model || (group?.cases.length || 0) < 50}><Play size={15} aria-hidden="true" />Run 50 local cases</button>{working && <button type="button" className="btn btn-ghost" onClick={stop}><Square size={15} aria-hidden="true" />Stop</button>}</div>
      </div>}

      {progress && <p className="mt-3 text-sm text-base-content/65" role="status" aria-live="polite">{progress}</p>}
      {error && <p className="mt-3 rounded-lg bg-error/10 p-3 text-sm" role="alert">{error}</p>}
      {group && group.cases.length < 50 && <p className="mt-3 text-sm text-warning">Add {50 - group.cases.length} more cases to this task and language direction before running it.</p>}

      {activeReport && <div className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-base-300 py-3">
          <div><p className="font-medium">{activeReport.modelId}</p><p className="text-xs text-base-content/55">Current review: {summary?.reviewed}/50 · acceptance {summary?.acceptance === null ? "—" : `${(summary.acceptance * 100).toFixed(0)}%`} · vs baseline {summary?.acceptanceDelta === null ? "baseline needed" : `${(summary.acceptanceDelta * 100).toFixed(0)} pp`}</p></div>
          <div className="flex items-center gap-2"><span className={`badge ${summary?.passed ? "badge-success" : "badge-ghost"}`}>{summary?.passed ? "Meets this group’s gate" : "Gate not met"}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadJson(`talkio-${model.id}-${group.key.replaceAll(":", "-").replaceAll(">", "-")}.json`, { modelId: activeReport.modelId, modelVersion: activeReport.modelVersion, group: group.key, summary, results: activeReport.results })}><Download size={15} aria-hidden="true" />Export report</button></div>
        </div>
        <div className="space-y-3">
          {activeReport.results.map((item, index) => <article key={item.id} className="rounded-xl border border-base-300 bg-base-100 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{index + 1}. {item.id}</h3><span className="text-xs tabular-nums text-base-content/55">first token {Number.isFinite(item.firstTokenMs) ? `${(item.firstTokenMs / 1000).toFixed(1)}s` : "—"} · total {Number.isFinite(item.completionMs) ? `${(item.completionMs / 1000).toFixed(1)}s` : "—"}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-base-content/70"><span className="font-medium text-base-content">Input: </span>{group.cases.find((c) => c.id === item.id)?.input}</p>
            {item.expectedOutput && <p className="mt-2 whitespace-pre-wrap text-sm text-base-content/65"><span className="font-medium">Expected: </span>{item.expectedOutput}</p>}
            {item.baselineOutput && <p className="mt-2 whitespace-pre-wrap text-sm text-base-content/65"><span className="font-medium">Higher precision baseline: </span>{item.baselineOutput}</p>}
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-base-200 p-3 text-sm leading-5">{typeof item.output === "string" ? item.output : JSON.stringify(item.output)}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <fieldset><legend className="mb-1 text-xs font-medium">Quantized answer</legend><div className="flex gap-2"><button type="button" className={`btn btn-xs ${item.verdict === "pass" ? "btn-success" : "btn-ghost"}`} onClick={() => mark(index, "verdict", "pass")}>Accept</button><button type="button" className={`btn btn-xs ${item.verdict === "fail" ? "btn-error" : "btn-ghost"}`} onClick={() => mark(index, "verdict", "fail")}>Reject</button></div></fieldset>
              {item.baselineOutput && <fieldset><legend className="mb-1 text-xs font-medium">Higher precision baseline</legend><div className="flex gap-2"><button type="button" className={`btn btn-xs ${item.baselineVerdict === "pass" ? "btn-success" : "btn-ghost"}`} onClick={() => mark(index, "baselineVerdict", "pass")}>Accept</button><button type="button" className={`btn btn-xs ${item.baselineVerdict === "fail" ? "btn-error" : "btn-ghost"}`} onClick={() => mark(index, "baselineVerdict", "fail")}>Reject</button></div></fieldset>}
            </div>
          </article>)}
        </div>
      </div>}
    </section>
  );
}
