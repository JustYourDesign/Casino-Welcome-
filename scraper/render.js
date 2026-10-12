// Renders data/casinos.json into docs/index.html (static page served by GitHub Pages).

import { mkdir, readFile, writeFile } from "node:fs/promises";

const DATA_FILE = new URL("../data/casinos.json", import.meta.url);
const OUT_DIR = new URL("../docs/", import.meta.url);

const escape = (value) =>
  String(value ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
const updated = new Date(data.scraped_at).toUTCString().replace(" GMT", " UTC");

const rows = data.casinos
  .map((c) => {
    const wagering = c.wagering_multiplier === null ? "—" : `${c.wagering_multiplier}x`;
    const basis = c.wagering_applies_to === "unknown" ? "" : ` <span class="muted">(${escape(c.wagering_applies_to)})</span>`;
    return `      <tr>
        <th scope="row" data-label="Casino">${escape(c.casino)}</th>
        <td data-label="Welcome bonus">${escape(c.welcome_bonus)}</td>
        <td data-label="Wagering"><span>${escape(wagering)}${basis}</span></td>
        <td data-label="Min. deposit">${escape(c.min_deposit)}</td>
        <td data-label="Source"><a href="${escape(c.source_url)}" rel="nofollow noopener" target="_blank">View page</a></td>
      </tr>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Casino Welcome Bonuses</title>
  <meta name="description" content="Welcome bonus terms for ${data.casinos.length} online casinos, scraped from ${escape(data.source)}.">
  <style>
    :root { --bg: #f7f7f8; --surface: #fff; --text: #1b1b1f; --muted: #5f6270; --border: #e2e3e8; --accent: #0b5cd5; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #121216; --surface: #1c1c22; --text: #ececf1; --muted: #a0a3b1; --border: #2e2f38; --accent: #7aa7ff; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 16px; }
    h1 { font-size: 1.6rem; margin: 0 0 4px; }
    p { margin: 0 0 24px; color: var(--muted); }
    a { color: var(--accent); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
    thead th { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    tbody tr:last-child > * { border-bottom: 0; }
    .muted { color: var(--muted); font-size: .85em; }
    td a { white-space: nowrap; }
    footer { margin-top: 16px; font-size: .85rem; color: var(--muted); }

    /* Phones: each casino becomes a stacked card with inline labels. */
    @media (max-width: 640px) {
      table, thead, tbody, tr, th, td { display: block; }
      table { border: 0; background: none; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      tr { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; padding: 4px 0; }
      th, td { display: flex; justify-content: space-between; gap: 16px; border: 0; padding: 8px 14px; text-align: right; }
      th[scope="row"] { font-size: 1.1rem; text-align: left; }
      td::before { content: attr(data-label); color: var(--muted); text-align: left; flex-shrink: 0; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Casino welcome bonuses</h1>
    <p>${data.casinos.length} casinos, scraped from ${escape(data.source)} · Last updated ${escape(updated)}</p>
    <table>
      <thead>
        <tr><th scope="col">Casino</th><th scope="col">Welcome bonus</th><th scope="col">Wagering</th><th scope="col">Min. deposit</th><th scope="col">Source</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <footer>Bonus terms change often. Always check the source page before relying on them. 18+, gamble responsibly.</footer>
  </main>
</body>
</html>
`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(new URL("index.html", OUT_DIR), html);
console.log("Wrote docs/index.html");
