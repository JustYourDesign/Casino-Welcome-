// Renders data/casinos.json into docs/index.html (static page served by GitHub Pages and Vercel).

import { mkdir, readFile, writeFile } from "node:fs/promises";

const DATA_FILE = new URL("../data/casinos.json", import.meta.url);
const OUT_DIR = new URL("../docs/", import.meta.url);

const escape = (value) =>
  String(value ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
const casinos = data.casinos;
const updated = new Date(data.scraped_at).toUTCString().replace(" GMT", " UTC").replace(/:\d\d UTC$/, " UTC");

// Wagering difficulty bands: lower multipliers are easier to clear before withdrawing.
const wageringLevel = (x) => (x === null ? "none" : x <= 15 ? "low" : x <= 35 ? "mid" : "high");
const levelLabel = { low: "Easy", mid: "Average", high: "Hard", none: "Not stated" };

const matchPercent = (bonus) => Number(bonus.match(/(\d+)\s*%/)?.[1] ?? 0);
// "Jackpot City Casino" -> "JC", "YesPlay Casino" -> "YP" (capitals inside one-word names count too).
const initials = (name) => {
  const words = name.replace(/\bcasino\b/i, "").trim().split(/\s+/);
  const letters = words.length > 1 ? words.map((w) => w[0]) : words[0].match(/[A-Z]/g) ?? [words[0][0]];
  return letters.slice(0, 2).join("").toUpperCase();
};

// Highlight tiles. Min deposit is left out because the casinos use different currencies.
const byLowestWagering = casinos.filter((c) => c.wagering_multiplier !== null)
  .sort((a, b) => a.wagering_multiplier - b.wagering_multiplier)[0];
const byBiggestMatch = [...casinos].sort((a, b) => matchPercent(b.welcome_bonus) - matchPercent(a.welcome_bonus))[0];
const highlights = [
  byLowestWagering && { label: "Lowest wagering", value: `${byLowestWagering.wagering_multiplier}x`, casino: byLowestWagering.casino },
  byBiggestMatch && matchPercent(byBiggestMatch.welcome_bonus) > 0 &&
    { label: "Biggest deposit match", value: `${matchPercent(byBiggestMatch.welcome_bonus)}%`, casino: byBiggestMatch.casino },
  { label: "Casinos compared", value: String(casinos.length), casino: `from ${data.source}` },
].filter(Boolean);

const tiles = highlights
  .map((h) => `        <div class="tile">
          <span class="tile-label">${escape(h.label)}</span>
          <span class="tile-value">${escape(h.value)}</span>
          <span class="tile-sub">${escape(h.casino)}</span>
        </div>`)
  .join("\n");

const rows = casinos
  .map((c) => {
    const level = wageringLevel(c.wagering_multiplier);
    const wagering = c.wagering_multiplier === null ? "—" : `${c.wagering_multiplier}x`;
    const basis = c.wagering_applies_to === "unknown" ? "" : `<span class="basis">on ${escape(c.wagering_applies_to.replace("+", " + "))}</span>`;
    return `          <tr>
            <th scope="row" data-label="Casino"><span class="casino"><span class="avatar" aria-hidden="true">${escape(initials(c.casino))}</span>${escape(c.casino)}</span></th>
            <td data-label="Welcome bonus"><span class="bonus">${escape(c.welcome_bonus)}</span></td>
            <td data-label="Wagering"><span class="wager"><span class="pill pill-${level}" title="${levelLabel[level]}">${escape(wagering)}</span>${basis}</span></td>
            <td data-label="Min. deposit"><span class="deposit">${escape(c.min_deposit)}</span></td>
            <td data-label="Source"><a class="source" href="${escape(c.source_url)}" rel="nofollow noopener" target="_blank">View source<span aria-hidden="true"> ↗</span></a></td>
          </tr>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Casino Welcome Bonuses</title>
  <meta name="description" content="Welcome bonus terms for ${casinos.length} online casinos, scraped from ${escape(data.source)}.">
  <style>
    :root {
      --bg: #f4f5f9; --surface: #ffffff; --surface-2: #f8f9fc; --text: #14151a; --muted: #5d6170; --border: #e3e5ec;
      --accent: #5b4bdb; --accent-soft: #ecebfd; --hero-1: #2a1f7a; --hero-2: #5b4bdb;
      --low: #0f7a4a; --low-bg: #e3f6ec; --mid: #8a5a00; --mid-bg: #fdf1d8; --high: #b42318; --high-bg: #fde7e5;
      --shadow: 0 1px 2px rgba(20, 21, 26, .05), 0 8px 24px rgba(20, 21, 26, .06);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0e0f14; --surface: #171821; --surface-2: #1d1f2a; --text: #ecedf3; --muted: #9a9db0; --border: #2a2c3a;
        --accent: #a99cff; --accent-soft: #262245; --hero-1: #1b1546; --hero-2: #3a2f9c;
        --low: #5fd49a; --low-bg: #12301f; --mid: #f1c15c; --mid-bg: #33280f; --high: #ff8a80; --high-bg: #3a1714;
        --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 8px 24px rgba(0, 0, 0, .25);
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: var(--accent); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 0 16px; }

    header { background: linear-gradient(135deg, var(--hero-1), var(--hero-2)); color: #fff; padding: 48px 0 96px; }
    .eyebrow { display: inline-block; font-size: .75rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; background: rgba(255, 255, 255, .14); padding: 4px 10px; border-radius: 999px; }
    h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.15; margin: 14px 0 8px; letter-spacing: -.02em; }
    .lede { margin: 0; max-width: 620px; color: rgba(255, 255, 255, .82); }
    .meta { margin-top: 16px; font-size: .85rem; color: rgba(255, 255, 255, .7); }

    main { margin-top: -64px; padding-bottom: 48px; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; box-shadow: var(--shadow); display: flex; flex-direction: column; }
    .tile-label { font-size: .8rem; color: var(--muted); }
    .tile-value { font-size: 1.7rem; font-weight: 700; letter-spacing: -.02em; }
    .tile-sub { font-size: .85rem; color: var(--muted); }

    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 16px 18px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: middle; }
    thead th { background: var(--surface-2); font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
    tbody tr:last-child > * { border-bottom: 0; }
    tbody tr:hover { background: var(--surface-2); }
    .casino { display: inline-flex; align-items: center; gap: 12px; font-weight: 600; white-space: nowrap; }
    .avatar { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: .85rem; font-weight: 700; }
    .bonus { font-weight: 600; }
    .wager { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: .9rem; }
    .pill-low { color: var(--low); background: var(--low-bg); }
    .pill-mid { color: var(--mid); background: var(--mid-bg); }
    .pill-high { color: var(--high); background: var(--high-bg); }
    .pill-none { color: var(--muted); background: var(--surface-2); }
    .basis { font-size: .78rem; color: var(--muted); }
    .deposit { font-variant-numeric: tabular-nums; }
    .source { display: inline-block; white-space: nowrap; font-size: .9rem; font-weight: 600; text-decoration: none; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); }
    .source:hover { background: var(--accent-soft); border-color: transparent; }

    .explain { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 28px; }
    .explain div { padding: 4px 2px; }
    .explain h2 { font-size: .95rem; margin: 0 0 4px; }
    .explain p { margin: 0; font-size: .9rem; color: var(--muted); }
    .legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .legend .pill { font-size: .75rem; font-weight: 600; }
    footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); font-size: .82rem; color: var(--muted); }

    /* Phones: each casino becomes a stacked card with inline labels. */
    @media (max-width: 720px) {
      header { padding: 36px 0 76px; }
      .tiles { grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .tile { padding: 12px; }
      .tile-label, .tile-sub { font-size: .72rem; line-height: 1.3; }
      .tile-value { font-size: 1.3rem; }
      .card { background: none; border: 0; box-shadow: none; overflow: visible; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      tr { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); margin-bottom: 12px; padding: 6px 0; }
      tbody tr:hover { background: var(--surface); }
      th, td { display: flex; justify-content: space-between; align-items: center; gap: 16px; border: 0; padding: 8px 16px; text-align: right; }
      th[scope="row"] { padding: 12px 16px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
      td::before { content: attr(data-label); color: var(--muted); font-size: .85rem; text-align: left; flex-shrink: 0; }
      .wager { align-items: flex-end; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <span class="eyebrow">Bonus tracker</span>
      <h1>Casino welcome bonuses, compared</h1>
      <p class="lede">The sign-up offers of ${casinos.length} online casinos, pulled automatically from ${escape(data.source)} and structured with an AI model, so the terms that matter sit side by side.</p>
      <p class="meta">Last updated ${escape(updated)}</p>
    </div>
  </header>

  <main class="wrap">
    <section class="tiles" aria-label="Highlights">
${tiles}
    </section>

    <div class="card">
      <table>
        <caption class="sr-only">Welcome bonus terms per casino</caption>
        <thead>
          <tr><th scope="col">Casino</th><th scope="col">Welcome bonus</th><th scope="col">Wagering</th><th scope="col">Min. deposit</th><th scope="col">Source</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>

    <section class="explain" aria-label="How to read this table">
      <div>
        <h2>Welcome bonus</h2>
        <p>Extra money the casino adds to your first deposit. "100% up to 3000 ZAR" means a R3000 deposit gets another R3000 on top.</p>
      </div>
      <div>
        <h2>Wagering</h2>
        <p>How many times you must bet the money before you can withdraw winnings. Lower is better.</p>
        <div class="legend"><span class="pill pill-low">≤15x easy</span><span class="pill pill-mid">16–35x average</span><span class="pill pill-high">36x+ hard</span></div>
      </div>
      <div>
        <h2>Min. deposit</h2>
        <p>The smallest deposit that qualifies for the bonus. Each figure is in the casino's own currency.</p>
      </div>
    </section>

    <footer>
      Data from <a href="${escape(data.listing_url)}" rel="nofollow noopener" target="_blank">${escape(data.source)}</a>, extracted with ${escape(data.model)}. Bonus terms change often, so check the source page before relying on them. 18+, gamble responsibly.
    </footer>
  </main>
</body>
</html>
`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(new URL("index.html", OUT_DIR), html);
console.log("Wrote docs/index.html");
