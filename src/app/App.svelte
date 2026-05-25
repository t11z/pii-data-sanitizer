<script lang="ts">
  import { onDestroy } from 'svelte';
  import { runSanitize, onPackProgress, type SanitizeRun } from './sanitizerClient';
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

  const segments = $derived.by<Segment[]>(() => {
    if (!run) return [{ text: input }];
    const { normalized, result } = run;
    const spans = [...result.spans].sort((a, b) => a.start - b.start);
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
    for (const span of run?.result.spans ?? []) {
      map.set(span.type, (map.get(span.type) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  });

  const groupedMapping = $derived.by<{
    groups: Array<{ label: string; rows: MappingEntry[] }>;
    ungrouped: MappingEntry[];
  }>(() => {
    const mapping = run?.result.mapping ?? [];
    const identities = run?.result.identities ?? [];
    const byPlaceholder = new Map(mapping.map((m) => [m.placeholder, m]));
    const groups = identities.map((idn) => ({
      label: idn.label,
      rows: idn.placeholders
        .map((ph) => byPlaceholder.get(ph))
        .filter((m): m is MappingEntry => m !== undefined),
    }));
    const grouped = new Set(identities.flatMap((idn) => idn.placeholders));
    const ungrouped = mapping.filter((m) => !grouped.has(m.placeholder));
    return { groups, ungrouped };
  });

  async function copyOutput() {
    if (!run) return;
    await navigator.clipboard.writeText(run.result.text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function loadSample() {
    input = SAMPLE;
  }

  function clearAll() {
    input = '';
  }

  function onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file.text().then((t) => (input = t));
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
        >📁 Open .txt<input type="file" accept=".txt,text/plain" onchange={onFile} /></label
      >
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
      <button onclick={copyOutput} disabled={!run}>{copied ? '✅ Copied' : '📋 Copy'}</button>
    </h2>
    <pre>{run?.result.text ?? ''}</pre>
  </section>

  {#if run && run.result.mapping.length > 0}
    <section class="pane">
      <h2>Mapping ({run.result.mapping.length})</h2>
      {#each groupedMapping.groups as g (g.label)}
        <h3 class="identity">🧩 {g.label}</h3>
        <table>
          <thead>
            <tr><th>Placeholder</th><th>Original</th><th>Type</th></tr>
          </thead>
          <tbody>
            {#each g.rows as m (m.placeholder)}
              <tr><td><code>{m.placeholder}</code></td><td>{m.original}</td><td>{m.type}</td></tr>
            {/each}
          </tbody>
        </table>
      {/each}
      {#if groupedMapping.ungrouped.length > 0}
        {#if groupedMapping.groups.length > 0}<h3 class="identity">Other</h3>{/if}
        <table>
          <thead>
            <tr><th>Placeholder</th><th>Original</th><th>Type</th></tr>
          </thead>
          <tbody>
            {#each groupedMapping.ungrouped as m (m.placeholder + '|' + m.original)}
              <tr><td><code>{m.placeholder}</code></td><td>{m.original}</td><td>{m.type}</td></tr>
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
