<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { runSanitize, onPackProgress, type SanitizeRun } from './sanitizerClient';
  import { buildMappingView, keyOf, type ManualEntry } from './mappingView';
  import { extractText } from './readers';
  import { ALL_PII_TYPES } from '../core';
  import type { MappingEntry, PiiType, SanitizeMode } from '../core';
  import { loadLlmSettings, saveLlmSettings, type LlmSettings } from './llm/settings';
  import { probeOllama } from './llm/ollama';
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

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissSelection();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!(e.target as HTMLElement).closest('.redact-chip')) dismissSelection();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onDown);
    window.addEventListener('scroll', dismissSelection, true);
    window.addEventListener('resize', dismissSelection);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', dismissSelection, true);
      window.removeEventListener('resize', dismissSelection);
    };
  });

  const SAMPLE = `Hi, this is Kai-Uwe von Braun. Reach me at kai-uwe@example.com
or +49 30 1234567. My account is DE89 3704 0044 0532 0130 00 and the
card on file is 4111 1111 1111 1111. The server 192.168.1.254 is down.
Please also CC Dr. Anjali Sharma and محمد حسن.`;

  const TYPE_LABELS: Record<PiiType, string> = {
    EMAIL: '📧 Email',
    PHONE: '📞 Phone',
    IBAN: '🏦 IBAN',
    CREDIT_CARD: '💳 Card',
    IP: '🌐 IP',
    MAC: '🔌 MAC',
    PERSON: '🧑 Name',
  };

  let input = $state(SAMPLE);
  let mode = $state<SanitizeMode>('redact');
  let minConfidence = $state(0.5);
  let enabled = $state<Record<PiiType, boolean>>(
    Object.fromEntries(ALL_PII_TYPES.map((t) => [t, true])) as Record<PiiType, boolean>
  );
  let run = $state<SanitizeRun | null>(null);
  let copied = $state(false);
  let fileLoading = $state(false);
  let fileError = $state('');

  // Manual overrides on top of the worker's detection. They live only in memory.
  // Values flagged as false positives: kept as-is in the output (not replaced).
  let disabled = $state<Set<string>>(new Set());
  // Manual group assignment: keyOf(type, value) -> identity id, or null for ungrouped.
  let assignments = $state<Record<string, number | null>>({});
  // Hand-added values covering missed detections (false negatives): replaced everywhere.
  let manual = $state<ManualEntry[]>([]);
  let packs = $state<{
    loaded: number;
    total: number;
    loadedNames: number;
    totalNames: number;
  } | null>(null);
  onPackProgress((p) => (packs = p));

  // --- Optional Ollama second layer (LLM recall boost). Off by default; the
  // enable/model controls only surface once a local Ollama server is reachable.
  let llm = $state<LlmSettings>(loadLlmSettings());
  let llmOpen = $state(false);
  let llmProbed = $state(false);
  let llmAvailable = $state(false);
  let llmModels = $state<string[]>([]);
  let probeTimer: ReturnType<typeof setTimeout> | undefined;

  // Effective model: the user's choice, falling back to the first installed one.
  const llmModel = $derived(llm.model || llmModels[0] || '');
  // Whether the LLM layer actually runs: reachable, enabled, and a model exists.
  const llmActive = $derived(llmAvailable && llm.enabled && !!llmModel);

  // Probe Ollama only once the user opens the LLM panel — and re-probe (debounced)
  // when the base URL changes while it's open. Crucially we never touch the network
  // on page load: reaching a local server otherwise triggers the browser's "access
  // local network devices" prompt on the hosted (HTTPS) site, which looks alarming.
  // Failures (offline / CORS / CSP) simply leave the option hidden.
  $effect(() => {
    if (!llmOpen) return; // no local-network access until the user asks for it
    const baseUrl = llm.baseUrl;
    clearTimeout(probeTimer);
    llmProbed = false;
    probeTimer = setTimeout(() => {
      void probeOllama(baseUrl).then((res) => {
        llmAvailable = res.ok;
        llmModels = res.models;
        llmProbed = true;
        // Default the model to the first installed one if none is chosen yet.
        if (res.ok && res.models.length > 0 && !untrack(() => llm.model)) {
          llm.model = res.models[0];
        }
      });
    }, 300);
  });

  // Persist settings whenever they change.
  $effect(() => {
    saveLlmSettings({ enabled: llm.enabled, baseUrl: llm.baseUrl, model: llm.model });
  });

  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const text = input;
    const options = {
      mode,
      minConfidence,
      types: ALL_PII_TYPES.filter((t) => enabled[t]),
    };
    const llmReq = llmActive ? { baseUrl: llm.baseUrl, model: llmModel } : undefined;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void runSanitize(text, options, llmReq).then((r) => {
        run = r;
      });
    }, 100);
  });

  onDestroy(() => {
    clearTimeout(timer);
    clearTimeout(probeTimer);
  });

  type Segment = { text: string; type?: PiiType; source?: string };

  const view = $derived(
    run
      ? buildMappingView(run.normalized, run.result.spans, mode, disabled, assignments, manual)
      : null
  );

  const segments = $derived.by<Segment[]>(() => {
    if (!run || !view) return [{ text: input }];
    const normalized = run.normalized;
    const spans = [...view.activeSpans].sort((a, b) => a.start - b.start);
    const out: Segment[] = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) out.push({ text: normalized.slice(cursor, span.start) });
      out.push({
        text: normalized.slice(span.start, span.end),
        type: span.type,
        source: span.source,
      });
      cursor = span.end;
    }
    if (cursor < normalized.length) out.push({ text: normalized.slice(cursor) });
    return out;
  });

  const manualKeys = $derived(new Set(manual.map((m) => keyOf(m.type, m.value))));

  const counts = $derived.by<Array<[PiiType, number]>>(() => {
    const map = new Map<PiiType, number>();
    for (const span of view?.activeSpans ?? []) {
      map.set(span.type, (map.get(span.type) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  });

  const hasOverrides = $derived(
    disabled.size > 0 || Object.keys(assignments).length > 0 || manual.length > 0
  );

  function assignRow(type: PiiType, original: string, value: string) {
    assignments = { ...assignments, [keyOf(type, original)]: value === '' ? null : Number(value) };
  }

  function toggleDisabled(type: PiiType, original: string, off: boolean) {
    const next = new Set(disabled);
    const k = keyOf(type, original);
    if (off) next.add(k);
    else next.delete(k);
    disabled = next;
  }

  function addManual(type: PiiType, value: string) {
    const v = value.trim();
    if (!v) return;
    const k = keyOf(type, v);
    if (manual.some((m) => keyOf(m.type, m.value) === k)) return;
    manual = [...manual, { type, value: v }];
  }

  function removeManual(type: PiiType, value: string) {
    const k = keyOf(type, value);
    manual = manual.filter((m) => keyOf(m.type, m.value) !== k);
  }

  function resetOverrides() {
    assignments = {};
    disabled = new Set();
    manual = [];
  }

  // --- Select-to-redact: a floating chip anchored to a text selection in the preview.
  let selection = $state<{ text: string; type: PiiType; rect: DOMRect } | null>(null);
  let manualValue = $state('');
  let manualType = $state<PiiType>('PERSON');

  function onPreviewSelect(event: Event) {
    const preview = event.currentTarget as HTMLElement;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      selection = null;
      return;
    }
    const range = sel.getRangeAt(0);
    if (!preview.contains(range.commonAncestorContainer)) {
      selection = null;
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      selection = null;
      return;
    }
    selection = { text, type: 'PERSON', rect: range.getBoundingClientRect() };
  }

  function confirmSelection() {
    if (!selection) return;
    addManual(selection.type, selection.text);
    window.getSelection()?.removeAllRanges();
    selection = null;
  }

  function dismissSelection() {
    selection = null;
  }

  function submitManualField() {
    addManual(manualType, manualValue);
    manualValue = '';
  }

  async function copyOutput() {
    if (!view) return;
    await navigator.clipboard.writeText(view.text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function loadSample() {
    input = SAMPLE;
  }

  function clearAll() {
    input = '';
  }

  async function onFile(event: Event) {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    fileError = '';
    fileLoading = true;
    try {
      input = await extractText(file);
    } catch (err) {
      fileError = err instanceof Error ? err.message : 'Could not read this file.';
    } finally {
      fileLoading = false;
      el.value = ''; // allow re-selecting the same file
    }
  }
</script>

{#if route === 'privacy'}
  <Privacy />
{:else}
  <header>
    <h1>🔒 PII Data Sanitizer</h1>
    <p class="tagline">
      Heuristic, multilingual PII detection &amp; redaction — running entirely in your browser.
    </p>
    <p class="zk">🛡️ Zero-knowledge: your text never leaves this device. No servers, no storage.</p>
    {#if packs && packs.totalNames > 0}
      <p class="packs">
        🌍 {packs.loadedNames.toLocaleString()} / {packs.totalNames.toLocaleString()} names loaded
      </p>
    {/if}
  </header>

  <section class="controls">
    <div class="control">
      <span class="label">Mode</span>
      <label><input type="radio" bind:group={mode} value="redact" /> 🏷️ Redact</label>
      <label><input type="radio" bind:group={mode} value="pseudonymize" /> 🔁 Pseudonymize</label>
    </div>

    <div class="control">
      <span class="label">Detect</span>
      {#each ALL_PII_TYPES as type (type)}
        <label><input type="checkbox" bind:checked={enabled[type]} /> {TYPE_LABELS[type]}</label>
      {/each}
    </div>

    <div class="control">
      <span class="label">Min. confidence: {minConfidence.toFixed(2)}</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={minConfidence} />
    </div>

    {#if llmActive}
      <div class="control">
        <span class="label">Layers</span>
        <span class="chip llm-on">🧠 LLM second layer · {llmModel}</span>
      </div>
    {/if}

    <div class="control actions">
      <button onclick={loadSample}>Sample</button>
      <button onclick={clearAll}>Clear</button>
      <label class="file"
        >📁 {fileLoading ? 'Reading…' : 'Open file'}<input
          type="file"
          accept=".txt,.csv,.json,.docx,.pdf,text/plain,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
          disabled={fileLoading}
          onchange={onFile}
        /></label
      >
      <button
        class="llm-toggle"
        class:active={llmActive}
        class:pending={llm.enabled && !llmActive}
        aria-expanded={llmOpen}
        title={llmActive
          ? 'LLM second layer active (local Ollama)'
          : llm.enabled
            ? 'LLM second layer enabled — open to connect to your local Ollama'
            : 'Optional local LLM (Ollama) second layer'}
        onclick={() => (llmOpen = !llmOpen)}>⚙︎ LLM</button
      >
      {#if fileError}<span class="file-error" role="alert">{fileError}</span>{/if}
    </div>
  </section>

  {#if llmOpen}
    <section class="pane llm-panel">
      <h2>🧠 LLM second layer (Ollama) — optional</h2>
      <p class="llm-note">
        A local <a href="https://ollama.com" target="_blank" rel="noopener">Ollama</a> server can
        act as a second pass that flags extra PII the heuristics miss. Your text is sent
        <strong>only to your own Ollama</strong> — never to us or any cloud. Off by default, and no connection
        is attempted until you open this panel.
      </p>

      <div class="llm-row">
        <label class="llm-field">
          Server URL
          <input
            type="text"
            bind:value={llm.baseUrl}
            spellcheck="false"
            placeholder="http://localhost:11434"
          />
        </label>
        <span class="llm-status" class:ok={llmAvailable} class:bad={llmProbed && !llmAvailable}>
          {#if !llmProbed}⏳ Checking…
          {:else if llmAvailable}✅ Connected ({llmModels.length} model{llmModels.length === 1
              ? ''
              : 's'})
          {:else}⚠️ Not reachable{/if}
        </span>
      </div>

      {#if llmAvailable}
        <div class="llm-row">
          <label class="llm-field">
            Model
            <select bind:value={llm.model}>
              {#each llmModels as m (m)}
                <option value={m}>{m}</option>
              {/each}
            </select>
          </label>
          <label class="llm-enable">
            <input type="checkbox" bind:checked={llm.enabled} />
            Use as second layer
          </label>
        </div>
      {:else if llmProbed}
        <p class="llm-help">
          Start Ollama with <code>ollama serve</code> and pull a model (e.g.
          <code>ollama pull llama3.2</code>). For the hosted site, allow this origin via
          <code>OLLAMA_ORIGINS</code>.
        </p>
      {/if}
    </section>
  {/if}

  <section class="panes">
    <div class="pane">
      <h2>Input</h2>
      <textarea bind:value={input} spellcheck="false" placeholder="Paste text with PII…"></textarea>
    </div>

    <div class="pane">
      <h2>
        Detected
        {#each counts as [type, n] (type)}
          <span class="chip">{TYPE_LABELS[type]} {n}</span>
        {/each}
      </h2>
      <div
        class="preview"
        role="textbox"
        tabindex="0"
        aria-label="Detected PII preview — select any missed value to redact it"
        onmouseup={onPreviewSelect}
        ontouchend={onPreviewSelect}
      >
        {#each segments as seg, i (i)}
          {#if seg.type}
            <mark
              class="pii"
              data-type={seg.type}
              data-source={seg.source}
              title={seg.source === 'manual'
                ? `${seg.type} (added manually)`
                : seg.source === 'llm'
                  ? `${seg.type} (found by LLM)`
                  : seg.type}>{seg.text}</mark
            >
          {:else}{seg.text}{/if}
        {/each}
      </div>
      <p class="hint">💡 Missed something? Select it above to redact every occurrence.</p>
    </div>
  </section>

  {#if selection}
    <div
      class="redact-chip"
      style="left: {selection.rect.left + selection.rect.width / 2}px; top: {selection.rect.top}px;"
      role="dialog"
      aria-label="Redact selected value"
    >
      <span class="chip-text" title={selection.text}>“{selection.text}”</span>
      <select bind:value={selection.type} aria-label="Type of the selected value">
        {#each ALL_PII_TYPES as type (type)}
          <option value={type}>{TYPE_LABELS[type]}</option>
        {/each}
      </select>
      <button class="chip-add" onclick={confirmSelection}>➕ Redact all</button>
    </div>
  {/if}

  <section class="pane output">
    <h2>
      Sanitized output
      <button onclick={copyOutput} disabled={!view}>{copied ? '✅ Copied' : '📋 Copy'}</button>
    </h2>
    <pre>{view?.text ?? ''}</pre>
  </section>

  {#snippet rowsTable(rows: MappingEntry[])}
    {@const showGroup = (view?.identities.length ?? 0) > 0}
    <table>
      <thead>
        <tr>
          <th>Placeholder</th>
          <th>Original</th>
          <th>Type</th>
          {#if showGroup}<th>Group</th>{/if}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as m (m.placeholder + '|' + m.original)}
          {@const isManual = manualKeys.has(keyOf(m.type, m.original))}
          <tr>
            <td><code>{m.placeholder}</code></td>
            <td
              >{m.original}{#if isManual}<span class="badge" title="Added manually">✋ manual</span
                >{/if}</td
            >
            <td>{m.type}</td>
            {#if showGroup && view}
              <td>
                <select
                  class="group-select"
                  aria-label="Assign {m.original} to an identity"
                  onchange={(e) => assignRow(m.type, m.original, e.currentTarget.value)}
                >
                  {#each view.identities as idn (idn.id)}
                    <option
                      value={String(idn.id)}
                      selected={view.memberOf.get(m.placeholder) === idn.id}>{idn.label}</option
                    >
                  {/each}
                  <option value="" selected={view.memberOf.get(m.placeholder) === undefined}
                    >— Ungrouped —</option
                  >
                </select>
              </td>
            {/if}
            <td class="row-action">
              {#if isManual}
                <button
                  class="link"
                  title="Remove this manual entry — stop replacing this value"
                  onclick={() => removeManual(m.type, m.original)}>🗑 Remove</button
                >
              {:else}
                <button
                  class="link"
                  title="Keep as-is — don't replace this value in the output (false positive)"
                  onclick={() => toggleDisabled(m.type, m.original, true)}>✕ Keep original</button
                >
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}

  {#if view && (view.rows.length > 0 || view.removed.length > 0 || manual.length > 0)}
    <section class="pane">
      <h2>
        Mapping ({view.rows.length})
        {#if hasOverrides}
          <button class="link reset" onclick={resetOverrides} title="Undo all manual changes"
            >↺ Reset</button
          >
        {/if}
      </h2>
      <form
        class="manual-add"
        onsubmit={(e) => {
          e.preventDefault();
          submitManualField();
        }}
      >
        <span class="manual-label">Missed a value?</span>
        <input
          type="text"
          bind:value={manualValue}
          placeholder="Type a value to redact everywhere…"
          aria-label="Value to redact"
        />
        <select bind:value={manualType} aria-label="Type of the value to redact">
          {#each ALL_PII_TYPES as type (type)}
            <option value={type}>{TYPE_LABELS[type]}</option>
          {/each}
        </select>
        <button type="submit" disabled={!manualValue.trim()}>+ Add</button>
      </form>
      {#each view.groups as g (g.id)}
        <h3 class="identity">🧩 {g.label}</h3>
        {@render rowsTable(g.rows)}
      {/each}
      {#if view.ungrouped.length > 0}
        {#if view.groups.length > 0}<h3 class="identity">Other</h3>{/if}
        {@render rowsTable(view.ungrouped)}
      {/if}
      {#if view.removed.length > 0}
        <h3 class="identity">Kept as original (not replaced)</h3>
        <table>
          <thead>
            <tr><th>Original</th><th>Type</th><th></th></tr>
          </thead>
          <tbody>
            {#each view.removed as r (r.key)}
              <tr class="removed">
                <td>{r.original}</td>
                <td>{r.type}</td>
                <td class="row-action">
                  <button
                    class="link"
                    title="Replace this value again"
                    onclick={() => toggleDisabled(r.type, r.original, false)}>↩ Restore</button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

  <footer>
    <p>
      Open source (MIT) ·
      <a href="https://github.com/t11z/pii-data-sanitizer">GitHub</a> ·
      <a href="#/privacy">Privacy &amp; Security</a> · Contributions welcome 🤝
    </p>
  </footer>
{/if}

<style>
  header h1 {
    margin: 0;
    font-size: 1.8rem;
  }
  .tagline {
    margin: 0.25rem 0 0;
    color: var(--muted);
  }
  .packs {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .zk {
    margin: 0.5rem 0 1.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: 8px;
    font-size: 0.9rem;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .control .label {
    font-weight: 600;
    color: var(--muted);
    margin-right: 0.25rem;
  }
  .control label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.9rem;
  }
  .actions {
    gap: 0.5rem;
  }
  button,
  .file {
    background: var(--accent-soft);
    color: var(--text);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 0.4rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .file input {
    display: none;
  }
  .file-error {
    color: #b00020;
    font-size: 0.8rem;
    align-self: center;
  }
  .panes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  @media (max-width: 800px) {
    .panes {
      grid-template-columns: 1fr;
    }
  }
  .pane {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.75rem 1rem 1rem;
    margin-bottom: 1rem;
  }
  .pane h2 {
    font-size: 1rem;
    margin: 0 0 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  textarea,
  .preview,
  pre {
    box-sizing: border-box;
    width: 100%;
    height: 220px;
    overflow: auto;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    border-radius: 8px;
  }
  textarea {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0.6rem;
    resize: vertical;
  }
  .preview {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 0.6rem;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  pre {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 0.6rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
  mark.pii {
    background: var(--hl);
    color: var(--text);
    border: 1px solid var(--hl-border);
    border-radius: 4px;
    padding: 0 2px;
  }
  mark.pii[data-source='manual'] {
    background: var(--accent-soft);
    border-color: var(--accent);
    border-style: dashed;
  }
  mark.pii[data-source='llm'] {
    border-style: dotted;
    border-width: 2px;
  }
  .chip.llm-on {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .llm-toggle.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .llm-toggle.pending {
    border-style: dashed;
    border-color: var(--accent);
    color: var(--accent);
  }
  .llm-panel .llm-note,
  .llm-panel .llm-help {
    margin: 0 0 0.75rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .llm-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 1rem;
    margin-bottom: 0.6rem;
  }
  .llm-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .llm-field input[type='text'],
  .llm-field select {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    min-width: 14rem;
  }
  .llm-enable {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }
  .llm-status {
    font-size: 0.85rem;
    color: var(--muted);
    align-self: center;
  }
  .llm-status.ok {
    color: var(--accent);
  }
  .llm-status.bad {
    color: #b00020;
  }
  .hint {
    margin: 0.4rem 0 0;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .redact-chip {
    position: fixed;
    transform: translate(-50%, calc(-100% - 8px));
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.45rem;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 10px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
  }
  .redact-chip .chip-text {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .redact-chip select {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.15rem 0.3rem;
    font-size: 0.8rem;
  }
  .redact-chip .chip-add {
    white-space: nowrap;
  }
  .badge {
    display: inline-block;
    margin-left: 0.4rem;
    padding: 0 0.4rem;
    font-size: 0.7rem;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: 999px;
  }
  .manual-add {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
  }
  .manual-add .manual-label {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .manual-add input[type='text'] {
    flex: 1 1 12rem;
    min-width: 8rem;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
  }
  .manual-add select {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.25rem 0.3rem;
    font-size: 0.8rem;
  }
  .chip {
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    color: var(--muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .group-select {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.15rem 0.3rem;
    font-size: 0.8rem;
    max-width: 14rem;
  }
  button.link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0.1rem 0.3rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  button.link:hover {
    text-decoration: underline;
  }
  button.link.reset {
    margin-left: auto;
  }
  .row-action {
    text-align: right;
    white-space: nowrap;
  }
  tr.removed td {
    color: var(--muted);
  }
  tr.removed td:first-child {
    text-decoration: line-through;
  }
  h3.identity {
    margin: 0.9rem 0 0.3rem;
    font-size: 0.9rem;
    color: var(--muted);
  }
  h3.identity:first-of-type {
    margin-top: 0.3rem;
  }
  footer {
    margin-top: 2rem;
    color: var(--muted);
    font-size: 0.85rem;
    text-align: center;
  }
  a {
    color: var(--accent);
  }
</style>
