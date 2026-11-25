<script lang="ts">
  import type { LlmSettings } from '../llm/settings';
  import { LLM_NUM_CTX } from '../llm/ollama';

  interface Props {
    llm: LlmSettings;
    llmProbed: boolean;
    llmAvailable: boolean;
    llmModels: string[];
    llmContextWarning: boolean;
    onBaseUrlChange: (url: string) => void;
    onModelChange: (model: string) => void;
    onEnabledChange: (enabled: boolean) => void;
    onClose: () => void;
  }

  let {
    llm,
    llmProbed,
    llmAvailable,
    llmModels,
    llmContextWarning,
    onBaseUrlChange,
    onModelChange,
    onEnabledChange,
    onClose,
  }: Props = $props();
</script>

<section
  class="mt-4 rounded-2xl bg-white/90 dark:bg-obsidian-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] p-4 vault-surface"
  aria-label="Local Ollama second layer configuration"
>
  <div class="flex items-start justify-between gap-3">
    <div>
      <h2
        class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-800 dark:text-slate-100"
      >
        Optional Local LLM Second Layer (Ollama)
      </h2>
      <p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
        A local
        <a
          href="https://ollama.com"
          target="_blank"
          rel="noopener noreferrer"
          class="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
        >
          Ollama
        </a>
        server can act as a second pass that flags extra PII the heuristics miss. Your text is sent
        <strong class="text-slate-800 dark:text-slate-200">only to your loopback Ollama</strong> — never
        to any cloud. Off by default; no connection is attempted until this drawer is opened.
      </p>
    </div>
    <button
      type="button"
      onclick={onClose}
      aria-label="Close Ollama settings"
      class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors"
    >
      <svg
        class="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-3">
    <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
      <span class="font-mono text-[11px] uppercase tracking-wider text-slate-500">Server URL</span>
      <input
        type="text"
        value={llm.baseUrl}
        oninput={(e) => onBaseUrlChange(e.currentTarget.value)}
        spellcheck="false"
        placeholder="http://localhost:11434"
        class="w-56 px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-obsidian-950 border border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500/60"
      />
    </label>

    <span
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border {llmAvailable
        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
        : llmProbed
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300'
          : 'bg-slate-200/70 dark:bg-white/[0.06] border-slate-300/60 dark:border-white/[0.08] text-slate-500 dark:text-slate-400'}"
    >
      {#if !llmProbed}
        Checking loopback…
      {:else if llmAvailable}
        Connected ({llmModels.length} model{llmModels.length === 1 ? '' : 's'})
      {:else}
        Not reachable
      {/if}
    </span>

    {#if llmAvailable}
      <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span class="font-mono text-[11px] uppercase tracking-wider text-slate-500">Model</span>
        <select
          value={llm.model}
          onchange={(e) => onModelChange(e.currentTarget.value)}
          class="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-obsidian-950 border border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500/60"
        >
          {#each llmModels as m (m)}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </label>

      <label
        class="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
      >
        <input
          type="checkbox"
          checked={llm.enabled}
          onchange={(e) => onEnabledChange(e.currentTarget.checked)}
          class="accent-emerald-500 rounded"
        />
        <span>Use as second layer</span>
      </label>
    {/if}
  </div>

  {#if !llmAvailable && llmProbed}
    <p class="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
      Start Ollama with <code
        class="font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/[0.07]"
        >ollama serve</code
      >
      and pull a model (e.g.
      <code class="font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/[0.07]"
        >ollama pull llama3.2</code
      >). For hosted origins, allow access via
      <code class="font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/[0.07]"
        >OLLAMA_ORIGINS</code
      >.
    </p>
  {/if}

  {#if llmContextWarning}
    <p
      role="status"
      class="mt-2.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5"
    >
      Long input — the local LLM sees roughly the first {LLM_NUM_CTX.toLocaleString()} tokens; tail text
      is still covered by the heuristic engine.
    </p>
  {/if}
</section>
