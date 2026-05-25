<script lang="ts">
  import { onDestroy } from 'svelte';
  import { runSanitize, onPackProgress, type SanitizeRun } from './sanitizerClient';
  import { buildMappingView, keyOf } from './mappingView';
  import { extractText } from './readers';
  import { ALL_PII_TYPES } from '../core';
  import type { MappingEntry, PiiType, SanitizeMode } from '../core';
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
  let packs = $state<{
    loaded: number;
    total: number;
    loadedNames: number;
    totalNames: number;
  } | null>(null);
  onPackProgress((p) => (packs = p));

  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const text = input;
    const options = {
      mode,
      minConfidence,
      types: ALL_PII_TYPES.filter((t) => enabled[t]),
    };
    clearTimeout(timer);
    timer = setTimeout(() => {
      void runSanitize(text, options).then((r) => {
        run = r;
      });
    }, 100);
  });

  onDestroy(() => clearTimeout(timer));

  type Segment = { text: string; type?: PiiType };

  const view = $derived(
    run ? buildMappingView(run.normalized, run.result.spans, mode, disabled, assignments) : null
  );

  const segments = $derived.by<Segment[]>(() => {
    if (!run || !view) return [{ text: input }];
    const normalized = run.normalized;
    const spans = [...view.activeSpans].sort((a, b) => a.start - b.start);
    const out: Segment[] = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) out.push({ text: normalized.slice(cursor, span.start) });
      out.push({ text: normalized.slice(span.start, span.end), type: span.type });
      cursor = span.end;
    }
    if (cursor < normalized.length) out.push({ text: normalized.slice(cursor) });
    return out;
  });

  const counts = $derived.by<Array<[PiiType, number]>>(() => {
    const map = new Map<PiiType, number>();
    for (const span of view?.activeSpans ?? []) {
      map.set(span.type, (map.get(span.type) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  });

  const hasOverrides = $derived(disabled.size > 0 || Object.keys(assignments).length > 0);

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

  function resetOverrides() {
    assignments = {};
    disabled = new Set();
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
      {#if fileError}<span class="file-error" role="alert">{fileError}</span>{/if}
    </div>
  </section>

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
      <div class="preview">
        {#each segments as seg, i (i)}
          {#if seg.type}
            <mark class="pii" data-type={seg.type} title={seg.type}>{seg.text}</mark>
          {:else}{seg.text}{/if}
        {/each}
      </div>
    </div>
  </section>

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
          <tr>
            <td><code>{m.placeholder}</code></td>
            <td>{m.original}</td>
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
              <button
                class="link"
                title="Keep as-is — don't replace this value in the output (false positive)"
                onclick={() => toggleDisabled(m.type, m.original, true)}>✕ Keep original</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}

  {#if view && (view.rows.length > 0 || view.removed.length > 0)}
    <section class="pane">
      <h2>
        Mapping ({view.rows.length})
        {#if hasOverrides}
          <button class="link reset" onclick={resetOverrides} title="Undo all manual changes"
            >↺ Reset</button
          >
        {/if}
      </h2>
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
