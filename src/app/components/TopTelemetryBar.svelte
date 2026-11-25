<script lang="ts">
  import type { PackProgress } from '../sanitizerClient';

  interface Props {
    soundEnabled: boolean;
    darkMode: boolean;
    llmOpen: boolean;
    llmActive: boolean;
    llmRunning: boolean;
    llmPending: boolean;
    packs: PackProgress | null;
    onToggleSound: () => void;
    onToggleTheme: () => void;
    onToggleLlm: () => void;
    onPurge: () => void;
  }

  let {
    soundEnabled,
    darkMode,
    llmOpen,
    llmActive,
    llmRunning,
    llmPending,
    packs,
    onToggleSound,
    onToggleTheme,
    onToggleLlm,
    onPurge,
  }: Props = $props();

  const packTooltip = $derived(
    packs && packs.totalNames > 0
      ? `${packs.loadedNames.toLocaleString()} / ${packs.totalNames.toLocaleString()} multilingual names loaded locally`
      : '100% client-side Web Worker engine'
  );
</script>

<header
  class="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-white/[0.07]"
>
  <!-- Brand Identity -->
  <div class="flex items-center gap-3.5">
    <div
      class="relative w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 p-[1px] shadow-lg shadow-emerald-500/20"
    >
      <div class="w-full h-full rounded-[11px] bg-obsidian-950 flex items-center justify-center">
        <!-- Custom Geometric Shield/Aperture SVG -->
        <svg
          class="w-5 h-5 text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12h6" />
          <path d="M9 9h6" opacity="0.45" />
          <path d="M9 15h4" opacity="0.45" />
        </svg>
      </div>
    </div>
    <div>
      <div class="flex items-center gap-2">
        <h1 class="text-lg sm:text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          PII Sanitizer
          <span
            class="font-serif italic font-normal text-emerald-600 dark:text-emerald-400 text-xl sm:text-2xl ml-0.5"
          >
            Atelier
          </span>
        </h1>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        Zero-knowledge client-side redaction &amp; reversible AI vault
      </p>
    </div>
  </div>

  <!-- Right Telemetry & Utility Actions -->
  <div class="flex items-center gap-2 sm:gap-2.5">
    <!-- Air-Gap Telemetry Pill -->
    <div
      title={packTooltip}
      class="hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-obsidian-850/90 border border-slate-200 dark:border-white/[0.08] shadow-sm"
    >
      <span class="relative flex h-2 w-2 zk-pulse">
        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span class="text-[11px] font-mono tracking-wide text-slate-600 dark:text-slate-300">
        0 KB SENT <span class="text-slate-400 dark:text-slate-600 mx-1">·</span> LOCAL ENGINE
      </span>
    </div>

    <!-- Optional Local Ollama Second Layer Toggle -->
    <button
      type="button"
      aria-expanded={llmOpen}
      onclick={onToggleLlm}
      title={llmActive
        ? 'Local Ollama LLM second layer active'
        : llmPending
          ? 'Local Ollama enabled — click to connect'
          : 'Optional local Ollama LLM second layer'}
      class="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-mono border transition-all {llmActive
        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-700 dark:text-emerald-300'
        : llmOpen
          ? 'bg-slate-200/80 dark:bg-obsidian-800 border-slate-300 dark:border-white/20 text-slate-900 dark:text-white'
          : 'bg-white/80 dark:bg-obsidian-850 border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20'}"
    >
      <span
        class="w-1.5 h-1.5 rounded-full {llmRunning
          ? 'bg-amber-400 animate-pulse'
          : llmActive
            ? 'bg-emerald-500'
            : llmPending
              ? 'bg-amber-400'
              : 'bg-slate-400 dark:bg-slate-600'}"
      ></span>
      <span>Ollama</span>
    </button>

    <!-- Subtle Sound Toggle -->
    <button
      type="button"
      onclick={onToggleSound}
      aria-pressed={soundEnabled}
      title="Toggle tactile audio feedback"
      aria-label="Toggle tactile audio feedback"
      class="p-2.5 rounded-xl bg-white/80 dark:bg-obsidian-850 border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all"
    >
      {#if soundEnabled}
        <svg
          class="w-4 h-4 text-emerald-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      {:else}
        <svg
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      {/if}
    </button>

    <!-- Theme Toggle (Obsidian Vault / Archival Paper) -->
    <button
      type="button"
      onclick={onToggleTheme}
      title="Switch Theme (Obsidian Vault / Archival Paper)"
      aria-label="Switch theme"
      class="p-2.5 rounded-xl bg-white/80 dark:bg-obsidian-850 border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all"
    >
      {#if darkMode}
        <svg
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        </svg>
      {:else}
        <svg
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      {/if}
    </button>

    <!-- Purge Vault Button -->
    <button
      type="button"
      onclick={onPurge}
      class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all active:scale-95"
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
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
      <span>Purge Memory</span>
    </button>
  </div>
</header>
