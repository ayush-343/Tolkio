import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, Cpu, Eraser, FlaskConical, LockKeyhole, Sparkles, Wifi, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import { runTask } from "../ai/router";
import { downloadModel, modelCached, removeModel } from "../ai/assets";
import { localRuntime } from "../ai/runtime";
import { axiosInstance } from "../lib/axios";
import AiBenchmarkPanel from "../components/AiBenchmarkPanel";

const TASKS = [
  ["starter", "Conversation starter"],
  ["rewrite", "Natural rewrite"],
  ["explain", "Explain a correction"],
  ["translate", "Translate text"],
  ["quiz", "Draft a quiz question"],
];
const LANGUAGES = [["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"]];
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const EMPTY_MODELS = [];
const formatBytes = (bytes = 0) => bytes >= 1_000_000_000
  ? `${(bytes / 1_000_000_000).toFixed(2)} GB`
  : `${(bytes / 1_000_000).toFixed(0)} MB`;

async function getModels() {
  const [{ data: catalog }, { data: capabilities }] = await Promise.all([
    axiosInstance.get("/v1/ai/models"),
    axiosInstance.get("/v1/capabilities"),
  ]);
  return { models: catalog.data, capabilities: capabilities.data };
}

export default function AiLabPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["aiModels"], queryFn: getModels });
  const models = data?.models ?? EMPTY_MODELS;
  const availableModels = useMemo(() => models.filter((model) => model.available), [models]);
  const [modelId, setModelId] = useState("");
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ value: 0, text: "" });
  const [task, setTask] = useState("starter");
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [level, setLevel] = useState("A2");
  const [input, setInput] = useState("");
  const [execution, setExecution] = useState("local");
  const [serverConsent, setServerConsent] = useState(false);
  const [result, setResult] = useState(null);
  const [actionError, setActionError] = useState("");
  const controller = useRef(null);

  useEffect(() => {
    if (!modelId && availableModels[0]) setModelId(availableModels[0].id);
  }, [availableModels, modelId]);

  const model = availableModels.find((candidate) => candidate.id === modelId);
  useEffect(() => {
    let cancelled = false;
    setIsDownloaded(false);
    setResult(null);
    if (model) modelCached(model).then((cached) => { if (!cancelled) setIsDownloaded(cached); }).catch(() => {});
    return () => { cancelled = true; };
  }, [model]);

  useEffect(() => () => {
    controller.current?.abort();
    localRuntime.release("Local AI was closed.");
  }, []);

  const capabilities = data?.capabilities;
  const canUseLocal = Boolean(capabilities?.local && model && isDownloaded);
  const canUseServer = Boolean(capabilities?.server);

  const perform = async (action) => {
    setActionError("");
    setBusy(true);
    try { await action(); }
    catch (cause) {
      const message = cause?.message || "The AI request could not be completed.";
      setActionError(message);
    } finally { setBusy(false); }
  };

  const handleDownload = () => perform(async () => {
    if (!model) throw new Error("This model has not been prepared for this environment yet.");
    controller.current = new AbortController();
    setProgress({ value: 0, text: "Checking this browser and its available storage…" });
    await downloadModel(model, (value) => setProgress({ value, text: "Downloading and verifying model files…" }), controller.current.signal);
    setIsDownloaded(true);
    setProgress({ value: 1, text: "The verified model is ready." });
    toast.success("Offline model downloaded and verified.");
  });

  const handleCancel = () => {
    controller.current?.abort();
    localRuntime.release("Model loading was cancelled.");
    setBusy(false);
    setProgress({ value: 0, text: "Download or inference cancelled." });
  };

  const handleRemove = () => perform(async () => {
    if (!model) return;
    localRuntime.release("The local model was removed.");
    await removeModel(model);
    setIsDownloaded(false);
    setProgress({ value: 0, text: "Model files removed from this browser." });
  });

  const handleRun = () => perform(async () => {
    const inputValue = input.trim();
    if (!inputValue) throw new Error("Enter text to try a task.");
    if (execution === "local" && !canUseLocal) throw new Error("Local evaluation is not enabled for this account or model.");
    if (execution === "server" && !serverConsent) throw new Error("Confirm server processing for this request first.");
    const request = { task, input: inputValue, sourceLanguage, targetLanguage, level, execution };
    if (execution === "local" && !localRuntime.manifest) {
      setProgress({ value: 0, text: "Loading the model into this browser…" });
      controller.current = new AbortController();
      await localRuntime.load(model, (event) => setProgress({ value: event.progress || 0, text: event.text || "Loading model…" }), controller.current.signal);
    }
    controller.current ||= new AbortController();
    setProgress({ value: 0, text: execution === "local" ? "Running on this device…" : "Sending the selected text for server assistance…" });
    const value = await runTask(request, {
      benchmark: execution === "local" && Boolean(capabilities?.benchmark),
      serverConsent: execution === "server" && serverConsent,
      signal: controller.current?.signal,
    });
    setResult(value);
    setProgress({ value: 1, text: execution === "local" ? "Completed on this device. Prompt text was not uploaded." : "Server response received." });
  });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-200 px-3 py-1.5 text-sm text-base-content/75">
          <Cpu size={16} aria-hidden="true" />
          Private by default
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">On-device AI lab</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-6 text-base-content/70 sm:text-base">
          Download a quantized model once, then try short language practice tasks in this browser. Text stays on this device unless you choose server assistance for a request.
        </p>
      </header>

      <section aria-labelledby="model-heading" className="rounded-2xl border border-base-300 bg-base-200 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="model-heading" className="text-lg font-semibold">Model download</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-5 text-base-content/65">Model files are optional and stored in this browser. Browser storage can be cleared by your device at any time.</p>
          </div>
          {isDownloaded && <span className="badge badge-success gap-1 self-start">Ready offline</span>}
        </div>

        {isLoading ? <div className="mt-5 h-12 animate-pulse rounded-lg bg-base-300" aria-label="Loading models" /> : error ? (
          <div role="alert" className="mt-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm">Could not load model information. Check your connection and reload this page.</div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="form-control w-full">
              <span className="label-text mb-2 font-medium">Quantized model</span>
              <select className="select select-bordered w-full bg-base-100" value={modelId} onChange={(event) => { setModelId(event.target.value); setProgress({ value: 0, text: "" }); }} disabled={busy}>
                {models.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={!candidate.available}>{candidate.name} · 4-bit{candidate.available ? ` · ${formatBytes(candidate.downloadBytes)}` : " · not prepared"}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {!isDownloaded ? (
                <button type="button" className="btn btn-primary" onClick={handleDownload} disabled={busy || !model}>
                  {busy ? <span className="loading loading-spinner loading-sm" aria-hidden="true" /> : <ArrowDownToLine size={17} aria-hidden="true" />}
                  {busy ? "Preparing…" : "Download for offline use"}
                </button>
              ) : <button type="button" className="btn btn-outline btn-error" onClick={handleRemove} disabled={busy}><Eraser size={16} aria-hidden="true" /> Remove model</button>}
              {busy && <button type="button" className="btn btn-ghost" onClick={handleCancel}>Cancel</button>}
            </div>
          </div>
        )}

        {busy && <progress className="progress progress-primary mt-4 w-full" value={Math.round(progress.value * 100)} max="100" aria-label="Model download or load progress" />}
        {progress.text && <p role="status" aria-live="polite" className="mt-2 text-sm text-base-content/70">{progress.text}</p>}
        {!model && !isLoading && !error && <p className="mt-4 rounded-lg bg-base-300/70 p-3 text-sm text-base-content/75">No model artifact is configured for this deployment. A maintainer must prepare and publish a pinned model manifest before users can download it.</p>}
        {model && <p className="mt-4 text-xs leading-5 text-base-content/55">Runtime {model.runtimeVersion} · upstream GPU-memory estimate {formatBytes(model.gpuMemoryMB * 1_000_000)} · actual browser memory use may be higher.</p>}
      </section>

      <section aria-labelledby="try-heading" className="rounded-2xl border border-base-300 bg-base-200 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 text-primary" size={20} aria-hidden="true" />
          <div><h2 id="try-heading" className="text-lg font-semibold">Try a language task</h2><p className="mt-1 text-sm leading-5 text-base-content/65">Only combination approval is enforced for normal use. An allowlisted evaluation account can also inspect experimental results.</p></div>
        </div>
        {!capabilities?.local && <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm leading-5 text-base-content/80"><LockKeyhole size={17} className="mt-0.5 shrink-0" aria-hidden="true" />No model artifact is configured for this deployment yet.</p>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="form-control"><span className="label-text mb-2 font-medium">Task</span><select className="select select-bordered bg-base-100" value={task} onChange={(event) => setTask(event.target.value)}>{TASKS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="form-control"><span className="label-text mb-2 font-medium">Text language</span><select className="select select-bordered bg-base-100" value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>{LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="form-control"><span className="label-text mb-2 font-medium">Answer language</span><select className="select select-bordered bg-base-100" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>{LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="form-control"><span className="label-text mb-2 font-medium">Learner level</span><select className="select select-bordered bg-base-100" value={level} onChange={(event) => setLevel(event.target.value)}>{LEVELS.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <label className="form-control mt-4"><span className="label-text mb-2 font-medium">Text to practice with <span className="font-normal text-base-content/55">(up to 2,000 characters)</span></span><textarea className="textarea textarea-bordered min-h-32 resize-y bg-base-100" maxLength={2000} value={input} onChange={(event) => setInput(event.target.value)} placeholder={task === "explain" ? "Paste the original sentence and the peer's correction." : "Enter a topic or sentence. Keep private information out of evaluation prompts."} /><span className="mt-1 text-right text-xs text-base-content/50">{input.length}/2000</span></label>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">Where should this request run?</legend>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 sm:flex-1 ${execution === "local" ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"}`}><input type="radio" className="radio radio-primary radio-sm mt-0.5" name="ai-execution" checked={execution === "local"} onChange={() => { setExecution("local"); setServerConsent(false); }} /><span><span className="flex items-center gap-2 text-sm font-medium"><WifiOff size={15} /> This device</span><span className="mt-1 block text-xs text-base-content/60">Offline after download. No prompt is uploaded.</span></span></label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 sm:flex-1 ${execution === "server" ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"}`}><input type="radio" className="radio radio-primary radio-sm mt-0.5" name="ai-execution" checked={execution === "server"} disabled={!canUseServer} onChange={() => setExecution("server")} /><span><span className="flex items-center gap-2 text-sm font-medium"><Wifi size={15} /> Server assistance</span><span className="mt-1 block text-xs text-base-content/60">Available only to enabled evaluation accounts.</span></span></label>
          </div>
        </fieldset>
        {execution === "server" && <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm leading-5"><input type="checkbox" className="checkbox checkbox-primary checkbox-sm mt-0.5" checked={serverConsent} onChange={(event) => setServerConsent(event.target.checked)} /><span>I agree to send the text above to Talkio's configured server AI for this request.</span></label>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={handleRun} disabled={busy || !input.trim() || (execution === "local" && !canUseLocal) || (execution === "server" && (!canUseServer || !serverConsent))}><Sparkles size={16} aria-hidden="true" />{busy ? "Working…" : "Run task"}</button>
          {result?.metrics && <span className="text-xs text-base-content/60">First token {(result.metrics.firstTokenMs / 1000).toFixed(1)}s · total {(result.metrics.completionMs / 1000).toFixed(1)}s</span>}
        </div>
        {actionError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm"><AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{actionError}</span></div>}
        {result && <div className="mt-5 rounded-xl border border-base-300 bg-base-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Model response</h3><span className="badge badge-ghost">{result.execution} · {result.modelId}</span></div><div className="mt-3 whitespace-pre-wrap text-sm leading-6">{typeof result.output === "string" ? result.output : <><p className="font-medium">{result.output.question}</p><ol className="mt-2 list-decimal space-y-1 pl-5">{result.output.options.map((option, index) => <li key={`${index}-${option}`}>{option}{index === result.output.answerIndex && <span className="ml-2 badge badge-success badge-sm">Answer</span>}</li>)}</ol><p className="mt-3 text-base-content/70">{result.output.explanation}</p></>}</div><p className="mt-3 flex items-start gap-2 text-xs leading-5 text-base-content/55"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />AI output is an unreviewed draft. Check translations and corrections before sharing or learning from them.</p></div>}
      </section>

      <AiBenchmarkPanel model={model} enabled={Boolean(capabilities?.benchmark && canUseLocal)} />

      <aside className="rounded-xl bg-base-200/70 p-4 text-sm leading-6 text-base-content/65"><p className="font-medium text-base-content/80">Experimental PWA support</p><p className="mt-1">Local inference requires a secure context, WebGPU, suitable storage, and a compatible device. Starting a video call pauses the model. If local AI is unavailable, you can choose server assistance when the deployment enables it.</p></aside>
    </main>
  );
}
