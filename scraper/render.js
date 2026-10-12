// Renders data/casinos.json into docs/index.html (static page served by GitHub Pages and Vercel).

import { mkdir, readFile, writeFile } from "node:fs/promises";

const DATA_FILE = new URL("../data/casinos.json", import.meta.url);
const OUT_DIR = new URL("../docs/", import.meta.url);

// Header photo: free under the Unsplash License (https://unsplash.com/license). Swap the URL to change it.
const HERO = {
  src: "https://images.unsplash.com/photo-1517232115160-ff93364542dd?auto=format&fit=crop&w=1920&q=75",
  credit: "Kaysha",
  creditUrl: "https://unsplash.com/@kaysha?utm_source=casino-bonus-scraper&utm_medium=referral",
  photoUrl: "https://unsplash.com/photos/V3qzwMY2ak0?utm_source=casino-bonus-scraper&utm_medium=referral",
};

const escape = (value) =>
  String(value ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
const casinos = data.casinos;
const updated = new Date(data.scraped_at).toUTCString().replace(" GMT", " UTC").replace(/:\d\d UTC$/, " UTC");

// Wagering difficulty bands: lower multipliers are easier to clear before withdrawing.
const wageringLevel = (x) => (x === null ? "none" : x <= 15 ? "low" : x <= 35 ? "mid" : "high");
const levelLabel = { low: "Easy", mid: "Average", high: "Hard", none: "Not stated" };
const WAGERING_SCALE_MAX = 50;

const matchPercent = (bonus) => Number(bonus.match(/(\d+)\s*%/)?.[1] ?? 0);

// "Jackpot City Casino" -> "JC", "YesPlay Casino" -> "YP" (capitals inside one-word names count too).
const initials = (name) => {
  const words = name.replace(/\bcasino\b/i, "").trim().split(/\s+/);
  const letters = words.length > 1 ? words.map((w) => w[0]) : words[0].match(/[A-Z]/g) ?? [words[0][0]];
  return letters.slice(0, 2).join("").toUpperCase();
};

// Stable colour per casino, derived from its name, so the avatar doesn't change between runs.
const hue = (name) => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

// "350% up to 2000 EUR + 1000 free spins" -> main offer and the extras after the "+".
const splitBonus = (bonus) => {
  const [main, ...extras] = bonus.split(/\s+\+\s+/);
  return { main, extras };
};

// Highlight tiles. Min deposit is left out because the casinos use different currencies.
const byLowestWagering = casinos.filter((c) => c.wagering_multiplier !== null)
  .sort((a, b) => a.wagering_multiplier - b.wagering_multiplier)[0];
const byBiggestMatch = [...casinos].sort((a, b) => matchPercent(b.welcome_bonus) - matchPercent(a.welcome_bonus))[0];
const highlights = [
  byLowestWagering && { label: "Lowest wagering", value: `${byLowestWagering.wagering_multiplier}x`, sub: byLowestWagering.casino },
  byBiggestMatch && matchPercent(byBiggestMatch.welcome_bonus) > 0 &&
    { label: "Biggest match", value: `${matchPercent(byBiggestMatch.welcome_bonus)}%`, sub: byBiggestMatch.casino },
  { label: "Casinos compared", value: String(casinos.length), sub: `via ${data.source}` },
].filter(Boolean);

const tiles = highlights
  .map((h) => `        <div class="tile">
          <span class="tile-label">${escape(h.label)}</span>
          <span class="tile-value">${escape(h.value)}</span>
          <span class="tile-sub">${escape(h.sub)}</span>
        </div>`)
  .join("\n");

const rows = casinos
  .map((c, i) => {
    const level = wageringLevel(c.wagering_multiplier);
    const wagering = c.wagering_multiplier === null ? "—" : `${c.wagering_multiplier}x`;
    const fill = c.wagering_multiplier === null ? 0 : Math.min(c.wagering_multiplier / WAGERING_SCALE_MAX, 1);
    const basis = c.wagering_applies_to === "unknown" ? levelLabel[level] : `${levelLabel[level]} · on ${c.wagering_applies_to.replace("+", " + ")}`;
    const { main, extras } = splitBonus(c.welcome_bonus);
    const extraChips = extras.map((e) => `<span class="chip">+ ${escape(e)}</span>`).join("");
    return `          <tr style="--h: ${hue(c.casino)}">
            <th scope="row" data-label="Casino">
              <span class="casino"><span class="avatar" aria-hidden="true">${escape(initials(c.casino))}</span><span><span class="rank">#${i + 1}</span>${escape(c.casino)}</span></span>
            </th>
            <td data-label="Welcome bonus"><span class="bonus"><span class="bonus-main">${escape(main)}</span>${extraChips}</span></td>
            <td data-label="Wagering">
              <span class="wager wager-${level}">
                <span class="wager-value">${escape(wagering)}</span>
                <span class="meter" aria-hidden="true"><span style="width: ${(fill * 100).toFixed(0)}%"></span></span>
                <span class="wager-basis">${escape(basis)}</span>
              </span>
            </td>
            <td data-label="Min. deposit"><span class="deposit">${escape(c.min_deposit)}</span></td>
            <td data-label="Source"><a class="source" href="${escape(c.source_url)}" rel="nofollow noopener" target="_blank">Source<span aria-hidden="true">↗</span></a></td>
          </tr>`;
  })
  .join("\n");

const icon = {
  gift: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/></svg>`,
  repeat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v14H5a2 2 0 0 1-2-2V5M16 14h.01"/></svg>`,
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Casino Welcome Bonuses</title>
  <meta name="description" content="Welcome bonus terms for ${casinos.length} online casinos, scraped from ${escape(data.source)}.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="preload" as="image" href="${escape(HERO.src)}">
  <style>
    :root {
      --bg: #0a0d0c; --surface: rgba(255, 255, 255, .045); --surface-hover: rgba(255, 255, 255, .07);
      --border: rgba(255, 255, 255, .09); --text: #f3f5f4; --muted: #9ba8a2; --faint: #6b7872;
      --gold: #f0c96b; --emerald: #3ddc97;
      --low: #3ddc97; --mid: #f0c96b; --high: #ff7a6b; --none: #6b7872;
      --radius: 22px;
      --font: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; color: var(--text); font: 16px/1.55 var(--font); -webkit-font-smoothing: antialiased;
      background:
        radial-gradient(60rem 40rem at 110% 30%, rgba(61, 220, 151, .08), transparent 60%),
        radial-gradient(50rem 36rem at -10% 80%, rgba(240, 201, 107, .07), transparent 60%),
        var(--bg);
      min-height: 100vh;
    }
    a { color: inherit; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 0 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    /* Hero: rounded photo panel with a dark gradient so the text stays readable. */
    .hero {
      position: relative; margin: 12px; border-radius: 32px; overflow: hidden; min-height: 460px;
      display: flex; align-items: flex-end; padding: 48px 0 120px;
      background: linear-gradient(180deg, rgba(10, 13, 12, .25) 0%, rgba(10, 13, 12, .55) 45%, rgba(10, 13, 12, .96) 100%),
        url("${escape(HERO.src)}") center 40% / cover no-repeat, #14201b;
    }
    .hero .wrap { width: 100%; }
    .eyebrow {
      display: inline-flex; align-items: center; gap: 8px; font-size: .78rem; font-weight: 600; letter-spacing: .04em;
      padding: 6px 14px; border-radius: 999px; background: rgba(255, 255, 255, .1); border: 1px solid rgba(255, 255, 255, .16);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 0 4px rgba(61, 220, 151, .2); }
    h1 { font-size: clamp(2.1rem, 5.5vw, 3.6rem); line-height: 1.05; font-weight: 800; letter-spacing: -.035em; margin: 18px 0 14px; max-width: 760px; }
    h1 em { font-style: normal; background: linear-gradient(90deg, var(--gold), #ffe3a3); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .lede { margin: 0; max-width: 580px; color: rgba(243, 245, 244, .78); font-size: 1.05rem; }

    main { margin-top: -96px; position: relative; padding-bottom: 40px; }

    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 36px; }
    .tile {
      display: flex; flex-direction: column; gap: 2px; padding: 20px 22px; border-radius: var(--radius);
      background: rgba(22, 28, 26, .72); border: 1px solid var(--border);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 20px 40px rgba(0, 0, 0, .35);
    }
    .tile-label { font-size: .82rem; color: var(--muted); }
    .tile-value { font-size: 2rem; font-weight: 800; letter-spacing: -.03em; color: var(--gold); }
    .tile-sub { font-size: .85rem; color: var(--faint); }

    .section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin: 0 4px 6px; }
    h2 { font-size: 1.35rem; letter-spacing: -.02em; margin: 0; }
    .updated { font-size: .85rem; color: var(--faint); }

    /* Table rows render as separate rounded cards. */
    table { width: 100%; border-collapse: separate; border-spacing: 0 12px; }
    thead th { padding: 6px 20px; text-align: left; font-size: .74rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); }
    tbody th, tbody td { padding: 20px; text-align: left; vertical-align: middle; background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); transition: background .2s ease; }
    tbody tr > :first-child { border-left: 1px solid var(--border); border-radius: var(--radius) 0 0 var(--radius); }
    tbody tr > :last-child { border-right: 1px solid var(--border); border-radius: 0 var(--radius) var(--radius) 0; text-align: right; }
    tbody tr:hover > * { background: var(--surface-hover); }

    .casino { display: inline-flex; align-items: center; gap: 14px; font-weight: 700; font-size: 1.02rem; white-space: nowrap; }
    .avatar {
      display: grid; place-items: center; width: 46px; height: 46px; flex-shrink: 0; border-radius: 16px; font-size: .9rem; font-weight: 800; color: #fff;
      background: linear-gradient(135deg, hsl(var(--h) 70% 55%), hsl(calc(var(--h) + 40) 75% 40%));
      box-shadow: 0 8px 20px hsl(var(--h) 70% 40% / .35);
    }
    .rank { display: block; font-size: .72rem; font-weight: 600; color: var(--faint); letter-spacing: .04em; }
    .bonus { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .bonus-main { font-weight: 700; font-size: 1.02rem; }
    .chip { font-size: .78rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; color: var(--gold); background: rgba(240, 201, 107, .12); white-space: nowrap; }

    .wager { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 10px; row-gap: 4px; min-width: 150px; }
    .wager-value { font-weight: 800; font-size: 1.1rem; color: var(--c); }
    .meter { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, .08); overflow: hidden; }
    .meter span { display: block; height: 100%; border-radius: inherit; background: var(--c); }
    .wager-basis { grid-column: 1 / -1; font-size: .78rem; color: var(--faint); }
    .wager-low { --c: var(--low); } .wager-mid { --c: var(--mid); } .wager-high { --c: var(--high); } .wager-none { --c: var(--none); }

    .deposit { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .source {
      display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 999px; text-decoration: none; font-size: .88rem; font-weight: 600;
      background: rgba(255, 255, 255, .08); border: 1px solid var(--border); transition: background .2s ease, transform .2s ease;
    }
    .source:hover { background: var(--gold); color: #1a1406; transform: translateY(-1px); }
    .source:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }

    .explain { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 28px; }
    .explain article { padding: 22px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); }
    .explain svg { width: 22px; height: 22px; fill: none; stroke: var(--gold); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .explain .ic { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; background: rgba(240, 201, 107, .1); margin-bottom: 14px; }
    .explain h3 { font-size: 1rem; margin: 0 0 6px; }
    .explain p { margin: 0; font-size: .9rem; color: var(--muted); }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; font-size: .78rem; color: var(--muted); }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }

    footer { margin-top: 40px; padding: 20px 4px 8px; border-top: 1px solid var(--border); font-size: .82rem; color: var(--faint); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; }
    footer a { color: var(--muted); }

    @media (max-width: 860px) {
      .explain { grid-template-columns: 1fr; }
    }

    /* Phones: each casino becomes a stacked card with inline labels. */
    @media (max-width: 900px) {
      .hero { margin: 8px; border-radius: 26px; min-height: 420px; padding: 32px 0 104px; }
      .tiles { gap: 8px; }
      .tile { padding: 14px 12px; border-radius: 18px; }
      .tile-label, .tile-sub { font-size: .7rem; line-height: 1.3; }
      .tile-value { font-size: 1.35rem; }
      .section-head { flex-direction: column; gap: 2px; }
      table, thead, tbody, tr, th, td { display: block; }
      table { border-spacing: 0; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      tbody tr { margin-top: 14px; padding: 6px 0 10px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); }
      tbody th, tbody td, tbody tr > :first-child, tbody tr > :last-child { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 18px; border: 0; border-radius: 0; background: none; text-align: right; }
      tbody tr:hover > * { background: none; }
      tbody th[scope="row"] { padding: 14px 18px; text-align: left; }
      td::before { content: attr(data-label); color: var(--faint); font-size: .82rem; text-align: left; flex-shrink: 0; }
      .bonus { justify-content: flex-end; }
      .wager { min-width: 130px; }
      .wager-basis { text-align: right; }
      td[data-label="Source"] { padding-top: 14px; }
      .source { flex: 1; justify-content: center; }
      td[data-label="Source"]::before { display: none; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="wrap">
      <span class="eyebrow"><span class="dot"></span>Updated ${escape(updated)}</span>
      <h1>Casino welcome bonuses, <em>compared</em></h1>
      <p class="lede">Sign-up offers from ${casinos.length} online casinos, pulled automatically from ${escape(data.source)} and structured with AI, so the terms that matter sit side by side.</p>
    </div>
  </header>

  <main class="wrap">
    <section class="tiles" aria-label="Highlights">
${tiles}
    </section>

    <div class="section-head">
      <h2>Bonus breakdown</h2>
      <span class="updated">${casinos.length} casinos · source: ${escape(data.source)}</span>
    </div>
    <table>
      <caption class="sr-only">Welcome bonus terms per casino</caption>
      <thead>
        <tr><th scope="col">Casino</th><th scope="col">Welcome bonus</th><th scope="col">Wagering</th><th scope="col">Min. deposit</th><th scope="col"><span class="sr-only">Source</span></th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>

    <section class="explain" aria-label="How to read this table">
      <article>
        <span class="ic">${icon.gift}</span>
        <h3>Welcome bonus</h3>
        <p>Extra money the casino adds to your first deposit. "100% up to 3000 ZAR" means a R3000 deposit gets another R3000 on top.</p>
      </article>
      <article>
        <span class="ic">${icon.repeat}</span>
        <h3>Wagering</h3>
        <p>How many times you must bet the money before you can withdraw winnings. Lower is better.</p>
        <div class="legend">
          <span style="--c: var(--low)"><i></i>≤15x easy</span>
          <span style="--c: var(--mid)"><i></i>16–35x average</span>
          <span style="--c: var(--high)"><i></i>36x+ hard</span>
        </div>
      </article>
      <article>
        <span class="ic">${icon.wallet}</span>
        <h3>Min. deposit</h3>
        <p>The smallest deposit that qualifies for the bonus. Each figure is in the casino's own currency.</p>
      </article>
    </section>

    <footer>
      <span>Data from <a href="${escape(data.listing_url)}" rel="nofollow noopener" target="_blank">${escape(data.source)}</a>, extracted with ${escape(data.model)}. Terms change often; check the source before relying on them. 18+, gamble responsibly.</span>
      <span>Photo by <a href="${escape(HERO.creditUrl)}" rel="noopener" target="_blank">${escape(HERO.credit)}</a> on <a href="${escape(HERO.photoUrl)}" rel="noopener" target="_blank">Unsplash</a></span>
    </footer>
  </main>
</body>
</html>
`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(new URL("index.html", OUT_DIR), html);
console.log("Wrote docs/index.html");
