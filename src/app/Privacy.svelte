<script lang="ts">
  // Purely technical privacy/security explanation. No personal data, no contact
  // details, no tracking claims we can't back up in code.
</script>

<article
  class="my-6 rounded-2xl bg-white/90 dark:bg-obsidian-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] p-6 sm:p-8 vault-surface max-w-3xl mx-auto space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
>
  <p>
    <a
      href="#/"
      class="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-4"
    >
      ← Back to Privacy Atelier
    </a>
  </p>

  <div>
    <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
      Privacy &amp;
      <span class="font-serif italic font-normal text-emerald-600 dark:text-emerald-400">
        Security Architecture
      </span>
    </h1>
    <p
      class="mt-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm"
    >
      This tool is <strong>zero-knowledge</strong>: everything happens inside your browser. Your
      text is never sent anywhere — there is no server that could see, log, or store it.
    </p>
  </div>

  <section class="space-y-2">
    <h2
      class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white"
    >
      Where the work happens
    </h2>
    <p>
      Detection and replacement run entirely on your device, inside a <strong>Web Worker</strong>
      (a background thread in your browser). The text you paste stays in your tab's volatile memory and
      is discarded as soon as you purge memory, close, or reload the page. Nothing is written to disk,
      cookies, or local storage.
    </p>
  </section>

  <section class="space-y-2">
    <h2
      class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white"
    >
      Opening files (PDF, DOCX, TXT, JSON, CSV, …)
    </h2>
    <p>
      When you open or drag-and-drop a file, it is read and parsed <strong
        >entirely in your browser</strong
      >. PDFs are handled by a bundled, same-origin copy of pdf.js and DOCX files are unzipped
      locally — the file is never uploaded. Only the extracted text enters the analysis, exactly as
      if you had pasted it.
    </p>
  </section>

  <section class="space-y-2">
    <h2
      class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white"
    >
      What never leaves your device
    </h2>
    <ul class="list-disc pl-5 space-y-1">
      <li>The raw text you analyze.</li>
      <li>The detected matches and the redacted / pseudonymized output.</li>
      <li>The Vault Map placeholder ↔ original mapping (strictly volatile RAM).</li>
    </ul>
  </section>

  <section class="space-y-2">
    <h2
      class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white"
    >
      What <em>is</em> loaded — and why it's still safe
    </h2>
    <p>
      On startup your browser downloads only static same-origin files: the app bundle, self-hosted
      fonts, and the <strong>name dictionaries</strong> (compact, read-only Bloom-filter data packs
      used to recognize multilingual names). These are <strong>downloads</strong> — data coming
      <em>to</em> your browser. At no point is any of your text uploaded.
    </p>
  </section>

  <section class="space-y-2">
    <h2
      class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white"
    >
      Optional local LLM layer (Ollama)
    </h2>
    <p>
      You can optionally enable a second detection pass powered by a
      <strong
        >local
        <a
          href="https://ollama.com"
          target="_blank"
          rel="noopener noreferrer"
          class="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
        >
          Ollama
        </a></strong
      >
      server running on your own machine. It is <strong>off by default</strong> and never probed
      until you explicitly open the Ollama panel. When enabled, your text is sent
      <strong>only to your own loopback Ollama</strong> — never to any cloud provider.
    </p>
  </section>

  <section class="space-y-2">
    <h2
      class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white"
    >
      Enforced by a strict Content-Security-Policy
    </h2>
    <p>
      The site ships a strict Content-Security-Policy that permits connections only to its own
      origin (<code
        class="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/[0.07]"
        >connect-src 'self'</code
      >) plus, for the optional layer above, a <strong>local</strong> Ollama (<code
        class="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/[0.07]"
        >http://localhost:11434</code
      >). There is <strong>no analytics, no tracking, and no third-party scripts or fonts</strong>.
    </p>
  </section>

  <section class="space-y-2">
    <h2
      class="text-xs font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white"
    >
      Don't trust — verify
    </h2>
    <ul class="list-disc pl-5 space-y-1">
      <li>
        Open DevTools → <strong>Network</strong> and use the tool: you will see only same-origin
        <em>GET</em> requests for static bundles/dictionaries and <strong>zero uploads</strong> of your
        text.
      </li>
      <li>
        Load the page once, then go <strong>offline</strong>: detection and redaction continue
        working with zero network access.
      </li>
      <li>
        The full source is open (MIT). Audit or
        <a
          href="https://github.com/t11z/pii-data-sanitizer"
          target="_blank"
          rel="noopener noreferrer"
          class="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
        >
          self-host
        </a>
        your own copy.
      </li>
    </ul>
  </section>

  <p class="pt-2 border-t border-slate-200/80 dark:border-white/[0.07]">
    <a
      href="#/"
      class="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-4"
    >
      ← Back to Privacy Atelier
    </a>
  </p>
</article>
