<script lang="ts">
  import { SAMPLE_PRESETS, type SampleKey } from '../atelier/samples';
  import type { CustomRule } from '../atelier/types';

  interface Props {
    sourceText: string;
    customRules: readonly CustomRule[];
    fileLoading: boolean;
    onSourceChange: (value: string) => void;
    onSelectSample: (key: SampleKey) => void;
    onImportFile: (file: File) => void;
    onAddCustomRule: (raw: string) => boolean;
    onRemoveCustomRule: (id: string) => void;
  }

  let {
    sourceText,
    customRules,
    fileLoading,
    onSourceChange,
    onSelectSample,
    onImportFile,
    onAddCustomRule,
    onRemoveCustomRule,
  }: Props = $props();

  let customRuleDraft = $state('');
  let dropActive = $state(false);
  let dragDepth = 0;

  function submitCustomRule() {
    if (onAddCustomRule(customRuleDraft)) {
      customRuleDraft = '';
    }
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      onImportFile(file);
    }
    input.value = '';
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    dragDepth += 1;
    dropActive = true;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dropActive = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      dropActive = false;
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth = 0;
    dropActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      onImportFile(file);
    }
  }
</script>

<div
  role="region"
  aria-label="Raw source workbench"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class="flex flex-col rounded-2xl bg-white/90 dark:bg-obsidian-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] vault-surface overflow-hidden transition-all {dropActive
    ? 'drop-active'
    : ''}"
>
  <!-- Pane Header -->
  <div
    class="px-4 py-3 border-b border-slate-200/80 dark:border-white/[0.07] flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-obsidian-850/60"
  >
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"></span>
      <span
        class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-700 dark:text-slate-200"
      >
        Raw Source
      </span>
      <span class="text-[11px] font-mono text-slate-400">
        {sourceText.length.toLocaleString()} chars
      </span>
    </div>

    <!-- Sample Presets & File Upload -->
    <div class="flex flex-wrap items-center gap-1.5">
      {#each SAMPLE_PRESETS as preset (preset.key)}
        <button
          type="button"
          onclick={() => onSelectSample(preset.key)}
          class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-200/70 dark:bg-white/[0.06] hover:bg-slate-300/70 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-300 transition-colors"
        >
          {preset.label}
        </button>
      {/each}

      <label
        class="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 transition-colors {fileLoading
          ? 'opacity-60 pointer-events-none'
          : ''}"
      >
        <svg
          class="w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>{fileLoading ? 'Reading…' : 'Import'}</span>
        <input
          type="file"
          accept=".txt,.json,.csv,.md,.log,.docx,.pdf"
          disabled={fileLoading}
          onchange={handleFileChange}
          class="hidden"
        />
      </label>
    </div>
  </div>

  <!-- Textarea Workspace -->
  <div class="relative flex-1 flex flex-col">
    <textarea
      value={sourceText}
      oninput={(e) => onSourceChange(e.currentTarget.value)}
      spellcheck="false"
      aria-label="Raw source document"
      placeholder={'Paste sensitive text, emails, logs, or drag & drop a .txt / .json / .csv / .docx / .pdf file here…\n\nEverything stays 100% inside your browser memory.'}
      class="w-full flex-1 min-h-[340px] p-5 bg-transparent resize-none focus:outline-none font-mono text-[13px] leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
    ></textarea>

    <!-- Custom Rule Quick-Add Bar -->
    <div
      class="px-4 py-2.5 border-t border-slate-200/80 dark:border-white/[0.07] bg-slate-50/70 dark:bg-obsidian-850/50 flex flex-wrap items-center gap-2"
    >
      <span
        class="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0"
      >
        Custom Rule:
      </span>
      <input
        type="text"
        bind:value={customRuleDraft}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitCustomRule();
          }
        }}
        placeholder="Add word or /regex/ (e.g. Project Orion)"
        aria-label="Custom redaction word or regex"
        class="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg text-xs font-mono bg-white dark:bg-obsidian-950 border border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60"
      />
      <button
        type="button"
        onclick={submitCustomRule}
        class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-obsidian-950 hover:opacity-90 transition-opacity"
      >
        + Redact
      </button>
    </div>

    <!-- Active Custom Rules Pills -->
    {#if customRules.length > 0}
      <div
        class="px-4 pb-2.5 bg-slate-50/70 dark:bg-obsidian-850/50 flex flex-wrap gap-1.5"
        aria-label="Active custom rules"
      >
        {#each customRules as rule (rule.id)}
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30"
          >
            <span>{rule.raw}</span>
            <button
              type="button"
              onclick={() => onRemoveCustomRule(rule.id)}
              aria-label="Remove custom rule {rule.raw}"
              class="hover:text-rose-500 font-bold leading-none"
            >
              &times;
            </button>
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>
