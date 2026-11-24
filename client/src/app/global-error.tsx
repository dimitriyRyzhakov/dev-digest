/* Last-resort boundary for errors in the root layout itself. It replaces the
   whole document, so no providers, theme or i18n are available here — plain
   markup and fixed English text on purpose. */
"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>DevDigest failed to load</h1>
        <p style={{ marginBottom: 16 }}>Reload the page. If it keeps happening, check the dev server log.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
