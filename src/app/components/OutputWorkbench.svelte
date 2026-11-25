<script lang="ts">
  import {
    MODE_LABELS,
    type AtelierEntityType,
    type AtelierRedactionMode,
    type AtelierView,
    type OutputLens,
  } from '../atelier/types';

  interface Props {
    sourceEmpty: boolean;
    view: AtelierView;
    lens: OutputLens;
    mode: AtelierRedactionMode;
    scanSweepKey: number;
    latencyMs: number;
    rehydrateInput: string;
    rehydrateOutput: string;
    rehydrateRestoredCount: number;
    llmRunning: boolean;
    onLensChange: (lens: OutputLens) => void;
    onCopySafe: () => void;
    onCopyToken: (token: string) => void;
    onDownloadTxt: () => void;
    onExportAuditJson: () => void;
    onRehydrateInputChange: (value: string) => void;
    onCopyRestored: () => void;
    onDisableEntity: (type: AtelierEntityType, original: string) => void;
    onRestoreEntity: (key: string) => void;
  }

  let {
    sourceEmpty,
    view,
    lens,
    mode,
    scanSweepKey,
    latencyMs,
    rehydrateInput,
    rehydrateOutput,
    rehydrateRestoredCount,
    llmRunning,
    onLensChange,
    onCopySafe,
    onCopyToken,
    onDownloadTxt,
    onExportAuditJson,
    onRehydrateInputChange,
    onCopyRestored,
    onDisableEntity,
    onRestoreEntity,
  }: Props = $props();

  const LENSES: readonly { id: OutputLens; label: string }[] = [
    { id: 'sanitized', label: 'Sanitized' },
    { id: 'classified', label: 'Classified Bars' },
    { id: 'vault', label: 'Vault Map' },
    { id: 'rehydrate', label: 'Re-Hydrate AI' },
  ];
</script>

<div
  class="relative flex flex-col rounded-2xl bg-white/90 dark:bg-obsidian-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] vault-surface overflow-hidden"
>
  <!-- Optical Scanline Beam -->
  {#if scanSweepKey > 0}
    {#key scanSweepKey}
      <div class="scan-beam active" aria-hidden="true"></div>
    {/key}
  {/if}

  <!-- Pane Header with Multi-Lens Tabs -->
  <div
    class="px-4 py-3 border-b border-slate-200/80 dark:border-white/[0.07] flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-obsidian-850/60"
  >
    <!-- Output View Lens Switcher -->
    <div
      class="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-obsidian-950 border border-slate-300/50 dark:border-white/[0.06]"
      role="tablist"
      aria-label="Output view lens"
    >
      {#each LENSES as item (item.id)}
        {@const active = lens === item.id}
        <button
          type="button"
          role="tab"
          aria-selected={active}
          onclick={() => onLensChange(item.id)}
          class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all {active
            ? 'bg-white dark:bg-obsidian-800 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          {item.label}
          {#if item.id === 'vault'}
            <span class="ml-0.5 text-[10px] opacity-70">({view.vaultEntries.length})</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Export & Copy Controls -->
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        onclick={onCopySafe}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 transition-all active:scale-95"
      >
        <svg
          class="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <span>Copy Safe</span>
      </button>

      <button
        type="button"
        onclick={onDownloadTxt}
        title="Download sanitized .txt"
        aria-label="Download sanitized .txt"
        class="p-1.5 rounded-lg bg-slate-200/70 dark:bg-white/[0.06] hover:bg-slate-300/70 dark:hover:bg-white/[0.12] text-slate-600 dark:text-slate-300 transition-colors"
      >
        <svg
          class="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

      <button
        type="button"
        onclick={onExportAuditJson}
        title="Export JSON Audit Report (no raw PII)"
        class="px-2 py-1.5 rounded-lg text-[11px] font-mono bg-slate-200/70 dark:bg-white/[0.06] hover:bg-slate-300/70 dark:hover:bg-white/[0.12] text-slate-600 dark:text-slate-300 transition-colors"
      >
        .JSON
      </button>
    </div>
  </div>

  <!-- LENS 1 & 2: SANITIZED / CLASSIFIED OUTPUT VIEW -->
  {#if lens === 'sanitized' || lens === 'classified'}
    <div
      class="flex-1 p-5 overflow-y-auto font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200"
    >
      {#if sourceEmpty}
        <div
          class="h-full flex flex-col items-center justify-center text-center py-16 text-slate-400 dark:text-slate-600"
        >
          <svg
            class="w-10 h-10 mb-3 opacity-40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <p class="text-xs font-mono">Sanitized output will appear here in real time.</p>
        </div>
      {:else}
        {#each view.segments as seg, i (i)}
          {#if seg.kind === 'text'}{seg.text}{:else if lens === 'classified'}<span
              class="classified-bar"
              data-label={seg.tokenPrefix}
              title="Hover to peek ({seg.label})">{seg.original}</span
            >{:else}<button
              type="button"
              onclick={() => onCopyToken(seg.replacement)}
              title="{seg.label}{seg.source === 'llm' ? ' · Local LLM' : ''} · Click to copy token"
              class="token-pill {seg.pillClass}">{seg.replacement}</button
            >{/if}
        {/each}
      {/if}
    </div>
  {:else if lens === 'vault'}
    <!-- LENS 3: VAULT MAP TABLE (REVERSIBLE MAPPING) -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Hover blurred secrets to inspect. Stored strictly in volatile RAM.</span>
        <span class="font-mono text-[11px] text-emerald-500">AES-0 / RAM ONLY</span>
      </div>

      <div class="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr
              class="bg-slate-100/80 dark:bg-obsidian-850 text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              <th class="py-2.5 px-3">Replacement</th>
              <th class="py-2.5 px-3">Type</th>
              <th class="py-2.5 px-3">Original (Hover)</th>
              <th class="py-2.5 px-3 text-right">Hits</th>
              <th class="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200/70 dark:divide-white/[0.06] font-mono">
            {#if view.vaultEntries.length === 0}
              <tr>
                <td colspan="5" class="py-10 text-center text-slate-400 dark:text-slate-600">
                  No entities mapped in local vault yet.
                </td>
              </tr>
            {:else}
              {#each view.vaultEntries as entry (entry.key)}
                <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td class="py-2.5 px-3">
                    <button
                      type="button"
                      onclick={() => onCopyToken(entry.replacement)}
                      title="Click to copy replacement"
                      class="token-pill {entry.pillClass}"
                    >
                      {entry.replacement}
                    </button>
                  </td>
                  <td class="py-2.5 px-3 text-slate-500 dark:text-slate-400">{entry.label}</td>
                  <td class="py-2.5 px-3">
                    <span class="vault-blur text-slate-800 dark:text-slate-200 select-all">
                      {entry.original}
                    </span>
                  </td>
                  <td class="py-2.5 px-3 text-right text-slate-500">{entry.count}×</td>
                  <td class="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onclick={() => onDisableEntity(entry.type, entry.original)}
                      title="Mark as false positive and keep original text"
                      class="text-[11px] font-sans text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      Keep
                    </button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      {#if view.removedEntries.length > 0}
        <div class="rounded-xl border border-slate-200 dark:border-white/[0.07] p-3">
          <div
            class="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2"
          >
            Kept as Original ({view.removedEntries.length})
          </div>
          <div class="flex flex-wrap gap-1.5">
            {#each view.removedEntries as rem (rem.key)}
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-slate-300"
              >
                <span class="line-through opacity-75">{rem.original}</span>
                <button
                  type="button"
                  onclick={() => onRestoreEntity(rem.key)}
                  class="text-emerald-600 dark:text-emerald-400 hover:underline font-sans"
                >
                  Restore
                </button>
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- LENS 4: RE-HYDRATE AI RESPONSE -->
    <div class="flex-1 flex flex-col p-4 gap-3">
      <div
        class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5"
      >
        <svg
          class="w-4 h-4 shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        <div>
          <strong>Reversible AI Workflow:</strong> Paste a response from ChatGPT, Claude, or Gemini
          that contains tokens like
          <code class="font-mono bg-emerald-500/20 px-1 rounded">[EMAIL_1]</code>. We'll restore the
          original values locally using your active Vault Map.
        </div>
      </div>

      <textarea
        value={rehydrateInput}
        oninput={(e) => onRehydrateInputChange(e.currentTarget.value)}
        spellcheck="false"
        rows="5"
        aria-label="AI response to re-hydrate"
        placeholder="Paste AI response containing [EMAIL_1], [PERSON_1], [IBAN_1]..."
        class="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-950 border border-slate-200 dark:border-white/[0.08] font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500/60 resize-none"
      ></textarea>

      <div class="flex items-center justify-between">
        <span class="text-[11px] font-mono uppercase tracking-wider text-slate-500">
          Restored Local Output
          {#if rehydrateRestoredCount > 0}
            <span class="ml-1.5 text-emerald-600 dark:text-emerald-400">
              ({rehydrateRestoredCount} restored)
            </span>
          {/if}
        </span>
        <button
          type="button"
          onclick={onCopyRestored}
          class="px-3 py-1 rounded-lg text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-obsidian-950 hover:opacity-90 transition-opacity"
        >
          Copy Restored
        </button>
      </div>

      <div
        class="flex-1 min-h-[120px] p-3.5 rounded-xl bg-slate-100/70 dark:bg-obsidian-850/70 border border-slate-200/80 dark:border-white/[0.06] font-mono text-xs whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200 overflow-y-auto"
      >
        {#if rehydrateInput.trim()}
          {rehydrateOutput}
        {:else}
          <span class="text-slate-400 dark:text-slate-500">Restored text will appear here…</span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Output Pane Footer Status -->
  <div
    class="px-4 py-2.5 border-t border-slate-200/80 dark:border-white/[0.07] bg-slate-50/70 dark:bg-obsidian-850/50 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400"
  >
    <div class="flex items-center gap-3">
      <span>Processed in {latencyMs.toFixed(2)} ms</span>
      <span class="text-slate-300 dark:text-slate-700">|</span>
      <span>{MODE_LABELS[mode]}</span>
      {#if llmRunning}
        <span class="text-amber-500 animate-pulse">· Local LLM pass…</span>
      {/if}
    </div>
    <span class="text-emerald-600 dark:text-emerald-400">Ready for LLM / Public Sharing</span>
  </div>
</div>
