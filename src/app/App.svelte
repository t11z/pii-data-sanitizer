<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { ALL_PII_TYPES, normalize } from '../core';
  import type { PiiType } from '../core';
  import {
    onPackProgress,
    runSanitize,
    type PackProgress,
    type SanitizeRun,
  } from './sanitizerClient';
  import { extractText } from './readers';
  import { loadLlmSettings, saveLlmSettings, type LlmSettings } from './llm/settings';
  import { LLM_NUM_CTX, probeOllama } from './llm/ollama';
  import {
    atelierKeyOf,
    buildAtelierView,
    buildAuditReport,
    parseCustomRule,
    rehydrateText,
  } from './atelier/engine';
  import { getSamplePreset, type SampleKey } from './atelier/samples';
  import { playTactileSound } from './atelier/audio';
  import { copyText } from './atelier/clipboard';
  import {
    TOGGLEABLE_ENTITY_TYPES,
    type AtelierEntityType,
    type AtelierRedactionMode,
    type CustomRule,
    type OutputLens,
    type ToastMessage,
    type ToastVariant,
    type ToggleableEntityType,
  } from './atelier/types';
  import TopTelemetryBar from './components/TopTelemetryBar.svelte';
  import ControlDeck from './components/ControlDeck.svelte';
  import OllamaDrawer from './components/OllamaDrawer.svelte';
  import SourceWorkbench from './components/SourceWorkbench.svelte';
  import OutputWorkbench from './components/OutputWorkbench.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import Privacy from './Privacy.svelte';

  function currentRoute(): 'home' | 'privacy' {
    return location.hash.replace(/^#\/?/, '') === 'privacy' ? 'privacy' : 'home';
  }
  let route = $state(currentRoute());
  $effect(() => {
    const onHashChange = () => (route = currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });

  // Initial boot sample & helpful re-hydration example
  const initialSample = getSamplePreset('email_de');
  let sourceText = $state(initialSample.content);
  let rehydrateInput = $state(initialSample.rehydrateHint ?? '');

  // Atelier UI state (strictly volatile RAM; raw PII never touches storage)
  let mode = $state<AtelierRedactionMode>('token');
  let lens = $state<OutputLens>('sanitized');
  let minConfidence = $state(0.5);
  let soundEnabled = $state(false);
  let darkMode = $state(
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );
  let scanSweepKey = $state(0);
  let latencyMs = $state(0.4);
  let fileLoading = $state(false);

  let enabledCategories = $state<Record<ToggleableEntityType, boolean>>(
    Object.fromEntries(TOGGLEABLE_ENTITY_TYPES.map((t) => [t, true])) as Record<
      ToggleableEntityType,
      boolean
    >
  );
  let customRules = $state<CustomRule[]>([]);
  let disabledKeys = $state<Set<string>>(new Set());

  // Non-blocking toast queue
  let toasts = $state<ToastMessage[]>([]);
  const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function showToast(message: string, variant: ToastVariant = 'success') {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    toasts = [...toasts, { id, message, variant }];
    const timer = setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      toastTimers.delete(id);
    }, 2600);
    toastTimers.set(id, timer);
  }

  // Name-pack progress reported by the Web Worker
  let packs = $state<PackProgress | null>(null);
  onPackProgress((p) => {
    packs = p;
  });

  // Optional local Ollama second layer (off by default, zero network until opened)
  let llm = $state<LlmSettings>(loadLlmSettings());
  let llmOpen = $state(false);
  let llmProbed = $state(false);
  let llmAvailable = $state(false);
  let llmModels = $state<string[]>([]);
  let probeTimer: ReturnType<typeof setTimeout> | undefined;

  const llmModel = $derived(llm.model || llmModels[0] || '');
  const llmActive = $derived(llmAvailable && llm.enabled && !!llmModel);
  const llmContextWarning = $derived(llmActive && sourceText.length / 4 > LLM_NUM_CTX);

  $effect(() => {
    if (!llmOpen) return; // no loopback probe until user explicitly opens panel
    const baseUrl = llm.baseUrl;
    clearTimeout(probeTimer);
    llmProbed = false;
    probeTimer = setTimeout(() => {
      void probeOllama(baseUrl).then((res) => {
        llmAvailable = res.ok;
        llmModels = res.models;
        llmProbed = true;
        if (res.ok && res.models.length > 0 && !untrack(() => llm.model)) {
          llm.model = res.models[0];
        }
      });
    }, 300);
  });

  $effect(() => {
    saveLlmSettings({ enabled: llm.enabled, baseUrl: llm.baseUrl, model: llm.model });
  });

  // Worker execution: Phase 1 fast heuristics + Phase 2 optional local Ollama
  let run = $state<SanitizeRun | null>(null);
  let heurTimer: ReturnType<typeof setTimeout> | undefined;
  let llmTimer: ReturnType<typeof setTimeout> | undefined;
  let llmRunning = $state(false);
  let gen = 0;
  let shownGen = -1;
  let shownLlm = false;

  const HEUR_DEBOUNCE_MS = 60;
  const LLM_DEBOUNCE_MS = 1000;

  $effect(() => {
    const text = sourceText;
    const activeCoreTypes: PiiType[] = ALL_PII_TYPES.filter((t) => enabledCategories[t]);
    const options = {
      mode: 'pseudonymize' as const,
      minConfidence,
      types: activeCoreTypes,
    };
    const wantLlm = llmActive;
    const llmReq = wantLlm ? { baseUrl: llm.baseUrl, model: llmModel } : undefined;
    const myGen = ++gen;

    clearTimeout(heurTimer);
    heurTimer = setTimeout(() => {
      const t0 = performance.now();
      void runSanitize(text, options).then((r) => {
        if (myGen !== gen) return;
        if (shownGen === myGen && shownLlm) return;
        run = r;
        latencyMs = Math.max(0.05, performance.now() - t0);
        shownGen = myGen;
        shownLlm = false;
      });
    }, HEUR_DEBOUNCE_MS);

    clearTimeout(llmTimer);
    if (wantLlm) {
      llmTimer = setTimeout(() => {
        llmRunning = true;
        const t0 = performance.now();
        void runSanitize(text, options, llmReq).then((r) => {
          if (myGen !== gen) return;
          run = r;
          latencyMs = Math.max(0.05, performance.now() - t0);
          shownGen = myGen;
          shownLlm = true;
          llmRunning = false;
        });
      }, LLM_DEBOUNCE_MS);
    } else {
      llmRunning = false;
    }
  });

  onDestroy(() => {
    clearTimeout(heurTimer);
    clearTimeout(llmTimer);
    clearTimeout(probeTimer);
    for (const timer of toastTimers.values()) clearTimeout(timer);
    toastTimers.clear();
  });

  // Derived Atelier view combining Web Worker spans + Secrets + Custom Rules + Redaction Mode
  const view = $derived.by(() => {
    const normalized = run ? run.normalized : normalize(sourceText);
    const coreSpans = run ? run.result.spans : [];
    return buildAtelierView({
      normalized,
      coreSpans,
      mode,
      secretsEnabled: enabledCategories.SECRET,
      customRules,
      disabledKeys,
    });
  });

  const rehydrated = $derived(rehydrateText(rehydrateInput, view.vaultEntries));

  // Sync dynamic ambient glow CSS custom property with live exposure risk
  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--ambient-color', view.exposure.ambientColor);
    }
  });

  // Sync dark class on <html>
  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', darkMode);
    }
  });

  function triggerOpticalSweep(toastMessage?: string) {
    scanSweepKey += 1;
    playTactileSound('scan', soundEnabled);
    showToast(
      toastMessage ?? `Optical scan complete · ${view.totalDetections} entities shielded`,
      'success'
    );
  }

  function handleModeChange(nextMode: AtelierRedactionMode) {
    mode = nextMode;
    playTactileSound('click', soundEnabled);
  }

  function handleToggleCategory(type: ToggleableEntityType) {
    enabledCategories = { ...enabledCategories, [type]: !enabledCategories[type] };
    playTactileSound('click', soundEnabled);
  }

  function handleSelectSample(key: SampleKey) {
    const preset = getSamplePreset(key);
    sourceText = preset.content;
    if (preset.rehydrateHint) {
      rehydrateInput = preset.rehydrateHint;
    }
    scanSweepKey += 1;
    playTactileSound('scan', soundEnabled);
    showToast(`Loaded "${preset.label}" sample locally`, 'success');
  }

  async function handleImportFile(file: File) {
    fileLoading = true;
    try {
      const text = await extractText(file);
      sourceText = text;
      scanSweepKey += 1;
      playTactileSound('scan', soundEnabled);
      showToast(`Loaded "${file.name}" locally`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read this file.', 'danger');
    } finally {
      fileLoading = false;
    }
  }

  function handleAddCustomRule(raw: string): boolean {
    if (!raw.trim()) return false;
    const rule = parseCustomRule(raw, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    if (!rule) {
      showToast('Invalid regex syntax.', 'danger');
      return false;
    }
    customRules = [...customRules, rule];
    playTactileSound('click', soundEnabled);
    showToast(`Added custom rule: "${rule.raw}"`, 'success');
    return true;
  }

  function handleRemoveCustomRule(id: string) {
    customRules = customRules.filter((r) => r.id !== id);
    playTactileSound('click', soundEnabled);
  }

  function handleDisableEntity(type: AtelierEntityType, original: string) {
    const next = new Set(disabledKeys);
    next.add(atelierKeyOf(type, original));
    disabledKeys = next;
    playTactileSound('click', soundEnabled);
    showToast('Entity marked as false positive (kept original)', 'info');
  }

  function handleRestoreEntity(key: string) {
    const next = new Set(disabledKeys);
    next.delete(key);
    disabledKeys = next;
    playTactileSound('click', soundEnabled);
    showToast('Entity restored to redaction vault', 'success');
  }

  async function handleCopySafe() {
    if (!view.plainText) {
      showToast('Nothing to copy yet.', 'info');
      return;
    }
    const ok = await copyText(view.plainText);
    if (ok) {
      playTactileSound('click', soundEnabled);
      showToast('Sanitized text copied to clipboard!', 'success');
    } else {
      showToast('Clipboard copy failed.', 'danger');
    }
  }

  async function handleCopyToken(token: string) {
    const ok = await copyText(token);
    if (ok) {
      playTactileSound('click', soundEnabled);
      showToast(`Copied token ${token}`, 'success');
    } else {
      showToast('Clipboard copy failed.', 'danger');
    }
  }

  async function handleCopyRestored() {
    if (!rehydrateInput.trim()) {
      showToast('Nothing to copy yet.', 'info');
      return;
    }
    const ok = await copyText(rehydrated.text);
    if (ok) {
      playTactileSound('click', soundEnabled);
      showToast('Restored text copied!', 'success');
    } else {
      showToast('Clipboard copy failed.', 'danger');
    }
  }

  function triggerDownload(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTxt() {
    if (!view.plainText) {
      showToast('Nothing to download yet.', 'info');
      return;
    }
    triggerDownload(
      view.plainText,
      'text/plain;charset=utf-8',
      `sanitized-document-${Date.now()}.txt`
    );
    playTactileSound('click', soundEnabled);
    showToast('Downloaded sanitized .txt file', 'success');
  }

  function handleExportAuditJson() {
    const report = buildAuditReport(view, mode);
    triggerDownload(
      JSON.stringify(report, null, 2),
      'application/json',
      `pii-audit-report-${Date.now()}.json`
    );
    playTactileSound('click', soundEnabled);
    showToast('Exported zero-PII audit report (.json)', 'success');
  }

  function handlePurge() {
    sourceText = '';
    rehydrateInput = '';
    customRules = [];
    disabledKeys = new Set();
    run = null;
    playTactileSound('purge', soundEnabled);
    showToast('Volatile memory & vault map purged.', 'danger');
  }

  function handleToggleSound() {
    soundEnabled = !soundEnabled;
    if (soundEnabled) playTactileSound('click', true);
    showToast(soundEnabled ? 'Tactile audio enabled' : 'Tactile audio muted', 'info');
  }

  function handleToggleTheme() {
    darkMode = !darkMode;
    playTactileSound('click', soundEnabled);
  }
</script>

<!-- Ambient Background Layers -->
<div class="fixed inset-0 bg-dot-grid pointer-events-none z-0" aria-hidden="true"></div>
<div class="ambient-orb" aria-hidden="true"></div>

<!-- Main Application Shell -->
<div
  class="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col min-h-screen"
>
  <TopTelemetryBar
    {soundEnabled}
    {darkMode}
    {llmOpen}
    {llmActive}
    {llmRunning}
    llmPending={llm.enabled && !llmActive}
    {packs}
    onToggleSound={handleToggleSound}
    onToggleTheme={handleToggleTheme}
    onToggleLlm={() => {
      llmOpen = !llmOpen;
      playTactileSound('click', soundEnabled);
    }}
    onPurge={handlePurge}
  />

  {#if route === 'privacy'}
    <Privacy />
  {:else}
    {#if llmOpen}
      <OllamaDrawer
        {llm}
        {llmProbed}
        {llmAvailable}
        {llmModels}
        {llmContextWarning}
        onBaseUrlChange={(url) => (llm.baseUrl = url)}
        onModelChange={(model) => (llm.model = model)}
        onEnabledChange={(val) => (llm.enabled = val)}
        onClose={() => (llmOpen = false)}
      />
    {/if}

    <ControlDeck
      exposure={view.exposure}
      totalDetections={view.totalDetections}
      {mode}
      {minConfidence}
      {enabledCategories}
      categoryCounts={view.categoryCounts}
      onModeChange={handleModeChange}
      onMinConfidenceChange={(v) => (minConfidence = v)}
      onToggleCategory={handleToggleCategory}
      onOpticalSanitize={() => triggerOpticalSweep()}
    />

    <!-- Main Optical Redaction Workbench (Split Pane) -->
    <main class="mt-5 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-[520px]">
      <SourceWorkbench
        {sourceText}
        {customRules}
        {fileLoading}
        onSourceChange={(val) => (sourceText = val)}
        onSelectSample={handleSelectSample}
        onImportFile={handleImportFile}
        onAddCustomRule={handleAddCustomRule}
        onRemoveCustomRule={handleRemoveCustomRule}
      />

      <OutputWorkbench
        sourceEmpty={!sourceText.trim()}
        {view}
        {lens}
        {mode}
        {scanSweepKey}
        {latencyMs}
        {rehydrateInput}
        rehydrateOutput={rehydrated.text}
        rehydrateRestoredCount={rehydrated.restoredCount}
        {llmRunning}
        onLensChange={(nextLens) => {
          lens = nextLens;
          playTactileSound('click', soundEnabled);
        }}
        onCopySafe={handleCopySafe}
        onCopyToken={handleCopyToken}
        onDownloadTxt={handleDownloadTxt}
        onExportAuditJson={handleExportAuditJson}
        onRehydrateInputChange={(val) => (rehydrateInput = val)}
        onCopyRestored={handleCopyRestored}
        onDisableEntity={handleDisableEntity}
        onRestoreEntity={handleRestoreEntity}
      />
    </main>
  {/if}

  <!-- Footer -->
  <footer
    class="mt-6 pt-4 border-t border-slate-200/70 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-500"
  >
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        Designed for
        <a
          href="https://github.com/t11z/pii-data-sanitizer"
          target="_blank"
          rel="noopener noreferrer"
          class="text-slate-700 dark:text-slate-300 hover:text-emerald-500 underline underline-offset-4 transition-colors"
        >
          t11z/pii-data-sanitizer
        </a>
        — Zero-Knowledge by Design.
      </span>
      <span class="text-slate-300 dark:text-slate-700">·</span>
      <a
        href="#/privacy"
        class="text-slate-600 dark:text-slate-400 hover:text-emerald-500 underline underline-offset-4 transition-colors"
      >
        Privacy &amp; Security
      </a>
    </div>
    <div class="font-mono text-[11px] flex flex-wrap items-center gap-2">
      {#if packs && packs.totalNames > 0}
        <span class="text-slate-400 dark:text-slate-500">
          {packs.loadedNames.toLocaleString()} names local
        </span>
        <span class="text-slate-300 dark:text-slate-700">·</span>
      {/if}
      <span>No telemetry · No cookies · No network calls</span>
    </div>
  </footer>
</div>

<ToastContainer {toasts} />
