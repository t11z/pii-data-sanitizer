<script lang="ts">
  import {
    ENTITY_META,
    TOGGLEABLE_ENTITY_TYPES,
    type AtelierEntityType,
    type AtelierRedactionMode,
    type ExposureAssessment,
    type ToggleableEntityType,
  } from '../atelier/types';

  interface Props {
    exposure: ExposureAssessment;
    totalDetections: number;
    mode: AtelierRedactionMode;
    minConfidence: number;
    enabledCategories: Record<ToggleableEntityType, boolean>;
    categoryCounts: Record<AtelierEntityType, number>;
    onModeChange: (mode: AtelierRedactionMode) => void;
    onMinConfidenceChange: (value: number) => void;
    onToggleCategory: (type: ToggleableEntityType) => void;
    onOpticalSanitize: () => void;
  }

  let {
    exposure,
    totalDetections,
    mode,
    minConfidence,
    enabledCategories,
    categoryCounts,
    onModeChange,
    onMinConfidenceChange,
    onToggleCategory,
    onOpticalSanitize,
  }: Props = $props();

  const CIRCUMFERENCE = 144.5;
  const strokeDashoffset = $derived(CIRCUMFERENCE - (exposure.score / 100) * CIRCUMFERENCE);

  const MODES: readonly { id: AtelierRedactionMode; label: string }[] = [
    { id: 'token', label: '[TOKENS]' },
    { id: 'block', label: '████ Vault' },
    { id: 'mask', label: 'm***@e***.de' },
    { id: 'synthetic', label: 'Synthetic Fake' },
  ];
</script>

<section class="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
  <!-- Exposure Risk Telemetry Card -->
  <div
    class="lg:col-span-4 rounded-2xl bg-white/85 dark:bg-obsidian-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] p-4 vault-surface flex items-center justify-between gap-4"
  >
    <div class="flex items-center gap-3.5 min-w-0">
      <!-- Radial Risk Gauge SVG -->
      <div class="relative w-14 h-14 shrink-0">
        <svg class="w-full h-full -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
          <circle
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke="currentColor"
            stroke-width="4.5"
            class="text-slate-200 dark:text-white/[0.07]"
          />
          <circle
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke={exposure.ringColor}
            stroke-width="4.5"
            stroke-linecap="round"
            stroke-dasharray={CIRCUMFERENCE}
            stroke-dashoffset={strokeDashoffset}
            class="transition-all duration-700 ease-out"
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-sm font-mono font-semibold text-slate-900 dark:text-white">
            {exposure.score}
          </span>
        </div>
      </div>

      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span
            class="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap"
          >
            Exposure Index
          </span>
          <span
            class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap shrink-0 {exposure.badgeClass}"
          >
            {exposure.badgeLabel}
          </span>
        </div>
        <p
          class="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate"
          title={exposure.summary}
        >
          {exposure.summary}
        </p>
      </div>
    </div>

    <!-- Entity Count Pill -->
    <div class="text-right shrink-0 pl-3 border-l border-slate-200 dark:border-white/[0.07]">
      <div
        class="text-2xl font-mono font-semibold tracking-tight text-slate-900 dark:text-white leading-none"
      >
        {totalDetections}
      </div>
      <div class="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-1">Entities</div>
    </div>
  </div>

  <!-- Redaction Strategy & Action Deck -->
  <div
    class="lg:col-span-8 rounded-2xl bg-white/85 dark:bg-obsidian-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] p-4 vault-surface flex flex-col justify-between gap-3"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- 4 Redaction Modes Segmented Control -->
      <div
        class="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-obsidian-950 border border-slate-200/80 dark:border-white/[0.06]"
        role="tablist"
        aria-label="Redaction mode"
      >
        {#each MODES as item (item.id)}
          {@const active = mode === item.id}
          <button
            type="button"
            role="tab"
            aria-selected={active}
            onclick={() => onModeChange(item.id)}
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all {active
              ? 'bg-white dark:bg-obsidian-800 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
          >
            {item.label}
          </button>
        {/each}
      </div>

      <!-- Confidence Threshold + Optical Sweep Trigger -->
      <div class="flex flex-wrap items-center gap-2.5">
        <label
          title="Minimum detection confidence threshold for heuristic scoring"
          class="hidden sm:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-obsidian-950/90 border border-slate-200/80 dark:border-white/[0.06] text-[11px] font-mono text-slate-500 dark:text-slate-400"
        >
          <span>Conf ≥ {minConfidence.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={minConfidence}
            oninput={(e) => onMinConfidenceChange(Number(e.currentTarget.value))}
            aria-label="Minimum detection confidence"
            class="w-16 accent-emerald-500 cursor-pointer"
          />
        </label>

        <button
          type="button"
          onclick={onOpticalSanitize}
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-obsidian-950 shadow-lg shadow-emerald-500/25 transition-all active:scale-95"
        >
          <svg
            class="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
            />
          </svg>
          <span>Optical Sanitize</span>
        </button>
      </div>
    </div>

    <!-- Interactive Entity Category Filter Chips -->
    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Entity filters">
      {#each TOGGLEABLE_ENTITY_TYPES as type (type)}
        {@const meta = ENTITY_META[type]}
        {@const isOn = enabledCategories[type]}
        {@const count = categoryCounts[type] ?? 0}
        <button
          type="button"
          aria-pressed={isOn}
          onclick={() => onToggleCategory(type)}
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all hover:border-emerald-500/40 {isOn
            ? 'bg-slate-900/[0.04] dark:bg-white/[0.06] border-slate-300/80 dark:border-white/[0.12] text-slate-800 dark:text-slate-200'
            : 'bg-transparent border-slate-200/70 dark:border-white/[0.05] text-slate-400 dark:text-slate-600 line-through opacity-60'}"
        >
          <span class="w-1.5 h-1.5 rounded-full {isOn ? meta.dotClass : 'bg-slate-500'}"></span>
          <span>{meta.label}</span>
          {#if count > 0}
            <span
              class="ml-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-mono bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-white"
            >
              {count}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</section>
