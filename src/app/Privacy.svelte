<script lang="ts">
  // Purely technical privacy/security explanation. No personal data, no contact
  // details, no tracking claims we can't back up in code.
</script>

<article class="privacy">
  <p class="back"><a href="#/">← Back to the tool</a></p>

  <h1>🔒 Privacy &amp; Security</h1>
  <p class="lead">
    This tool is <strong>zero-knowledge</strong>: everything happens inside your browser. Your text
    is never sent anywhere — there is no server that could see, log, or store it.
  </p>

  <h2>🧠 Where the work happens</h2>
  <p>
    Detection and replacement run entirely on your device, inside a <strong>Web Worker</strong>
    (a background thread in your browser). The text you paste stays in your tab's memory and is discarded
    as soon as you close or reload the page. Nothing is written to disk, cookies, or local storage.
  </p>

  <h2>📄 Opening files (PDF, DOCX, …)</h2>
  <p>
    When you open a file, it is read and parsed <strong>entirely in your browser</strong>. PDFs are
    handled by a bundled, same-origin copy of pdf.js and DOCX files are unzipped locally — the file
    is never uploaded. Only the extracted text enters the analysis, exactly as if you had pasted it.
  </p>

  <h2>🚫 What never leaves your device</h2>
  <ul>
    <li>The text you analyze.</li>
    <li>The detected matches and the redacted / pseudonymized output.</li>
    <li>The placeholder ↔ original mapping (it only exists in memory).</li>
  </ul>

  <h2>⬇️ What <em>is</em> loaded — and why it's still safe</h2>
  <p>
    On startup your browser downloads only static files: the app code and the
    <strong>name dictionaries</strong> (compact, read-only data packs used to recognize names).
    These are <strong>downloads</strong> — data coming <em>to</em> your browser. At no point is any of
    your text uploaded. The name packs are generic dictionaries; they contain no information about you.
  </p>

  <h2>🛡️ Enforced by a strict Content-Security-Policy</h2>
  <p>
    The site ships a Content-Security-Policy that only permits connections to its own origin (<code
      >connect-src 'self'</code
    >) and forbids embedding, inline scripts from third parties, and outbound calls to analytics or
    trackers. There is <strong>no analytics, no tracking, and no third-party scripts</strong>.
  </p>

  <h2>✅ Don't trust — verify</h2>
  <p>You can confirm all of the above yourself:</p>
  <ul>
    <li>
      Open your browser's DevTools → <strong>Network</strong> tab and use the tool. You'll see only
      <em>GET</em>
      requests for app and dictionary files, and <strong>zero uploads</strong>
      of your text.
    </li>
    <li>
      Or: load the page once, then go <strong>offline</strong> (airplane mode / disconnect). The tool
      keeps working — proof that detection needs no server.
    </li>
    <li>
      The full source is open (MIT). Read it, audit it, or
      <a href="https://github.com/t11z/pii-data-sanitizer">self-host</a> your own copy.
    </li>
  </ul>

  <h2>🗑️ Data retention</h2>
  <p>
    None. There is no database and no backend. Because nothing is sent or stored, there is nothing
    to retain, delete, or breach.
  </p>

  <p class="back"><a href="#/">← Back to the tool</a></p>
</article>

<style>
  .privacy {
    line-height: 1.65;
  }
  .privacy h1 {
    font-size: 1.8rem;
    margin: 0.25rem 0 0.5rem;
  }
  .privacy h2 {
    font-size: 1.1rem;
    margin: 1.5rem 0 0.4rem;
  }
  .lead {
    color: var(--text);
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
  }
  .privacy ul {
    margin: 0.4rem 0;
    padding-left: 1.2rem;
  }
  .privacy li {
    margin: 0.25rem 0;
  }
  .privacy code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
  }
  .back a {
    color: var(--accent);
    font-size: 0.9rem;
  }
</style>
