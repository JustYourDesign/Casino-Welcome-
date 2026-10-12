// Scrapes welcome bonuses for 3 casinos from AskGamblers and writes data/casinos.json.
// Pipeline: robots.txt check -> fetch listing -> fetch each bonus page -> clean text ->
// Gemini extracts the structured fields -> sanity checks -> JSON file.

import { mkdir, writeFile } from "node:fs/promises";
import { ApiError, GoogleGenAI } from "@google/genai";
import { notify } from "./notify.js";
import { isAllowed } from "./robots.js";

const LISTING_URL = "https://www.askgamblers.com/casino-bonuses/welcome";
const BONUS_LINK = /href="(\/casino-bonuses\/latest\/[^"#?]+)"/g;
const CASINO_COUNT = 3;
const MAX_CANDIDATES = 10;
const REQUEST_DELAY_MS = 1500;
const USER_AGENT = "casino-bonus-scraper/1.0 (+screening task; polite, robots.txt-aware)";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const OUTPUT_FILE = new URL("../data/casinos.json", import.meta.url);

const BONUS_SCHEMA = {
  type: "object",
  properties: {
    casino: { type: "string", description: "Casino name, e.g. \"Gangsta Casino\"." },
    welcome_bonus: {
      type: "string",
      description:
        "Headline welcome offer in the form \"100% up to 500 EUR\", adding \" + N free spins\" if included. Use ISO currency codes (EUR, USD, ZAR...).",
    },
    wagering_multiplier: {
      type: ["number", "null"],
      description: "Wagering multiplier of the main bonus, e.g. 35 for \"35x\". null if the page does not state one.",
    },
    wagering_applies_to: {
      type: "string",
      enum: ["bonus", "deposit+bonus", "unknown"],
      description: "What the multiplier applies to: \"xb\" means bonus, \"x(d+b)\" means deposit+bonus.",
    },
    min_deposit: {
      type: ["string", "null"],
      description: "Minimum deposit to claim this offer, as \"<amount> <ISO currency>\", e.g. \"20 EUR\". null if not stated.",
    },
  },
  required: ["casino", "welcome_bonus", "wagering_multiplier", "wagering_applies_to", "min_deposit"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You extract casino welcome-bonus terms from the text of a single bonus page.
Only use facts stated in the text for the page's main offer (the first offer described). Ignore the
"other bonuses" and "similar offers" lists. If a value is not stated, return null rather than guessing.
If the page lists both a headline minimum deposit and a different "bonus only" minimum, use the headline one.`;

const ai = new GoogleGenAI({}); // reads GEMINI_API_KEY from the environment

async function main() {
  console.log(`Source: ${LISTING_URL}`);
  const listingHtml = await politeFetch(LISTING_URL);
  const links = [...new Set([...listingHtml.matchAll(BONUS_LINK)].map((m) => m[1]))]
    .slice(0, MAX_CANDIDATES)
    .map((path) => new URL(path, LISTING_URL).href);
  if (links.length === 0) throw new Error("No bonus links found on the listing page; the layout may have changed.");

  const casinos = [];
  const problems = []; // collected for the Telegram summary
  for (const url of links) {
    if (casinos.length === CASINO_COUNT) break;
    try {
      const text = pageText(await politeFetch(url));
      const extracted = await extractBonus(text);
      if (casinos.some((c) => c.casino.toLowerCase() === extracted.casino.toLowerCase())) continue;
      for (const warning of sanityCheck(extracted, text)) {
        console.warn(`  ! ${extracted.casino}: ${warning}`);
        problems.push(`${extracted.casino}: ${warning}`);
      }
      casinos.push({ ...extracted, source_url: url });
      console.log(`  ✓ ${extracted.casino}: ${extracted.welcome_bonus} | ${extracted.wagering_multiplier}x | min ${extracted.min_deposit}`);
    } catch (err) {
      // A bad key, unknown model or exhausted quota fails for every page, so stop instead of crawling on.
      if (err instanceof ApiError && [400, 401, 403, 404, 429].includes(err.status)) throw err;
      console.warn(`  ✗ Skipped ${url}: ${err.message}`);
      problems.push(`Skipped ${new URL(url).pathname.split("/").pop()}: ${err.message.slice(0, 120)}`);
    }
  }
  if (casinos.length < CASINO_COUNT) throw new Error(`Only extracted ${casinos.length}/${CASINO_COUNT} casinos.`);

  const output = { source: "AskGamblers", listing_url: LISTING_URL, scraped_at: new Date().toISOString(), model: MODEL, casinos };
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${casinos.length} casinos to data/casinos.json`);

  const lines = casinos.map((c) => `• ${c.casino}: ${c.welcome_bonus}, ${c.wagering_multiplier ?? "?"}x, min ${c.min_deposit ?? "?"}`);
  const warnings = problems.length ? `\n\n⚠️ ${problems.length} warning(s):\n${problems.map((p) => `• ${p}`).join("\n")}` : "";
  await notify(`${problems.length ? "⚠️" : "✅"} Casino scrape OK: ${casinos.length}/${CASINO_COUNT} casinos updated\n\n${lines.join("\n")}${warnings}`);
}

async function politeFetch(url) {
  if (!(await isAllowed(url, USER_AGENT))) throw new Error(`Disallowed by robots.txt: ${url}`);
  await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  // A block (403/429) or challenge page means we stop rather than try to get around it.
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Reduce a bonus page to the readable text of its main offer, which keeps the LLM input small.
function pageText(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const text = decodeEntities(
    main
      .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
  const end = text.indexOf("Suggest an edit");
  return (end > 0 ? text.slice(0, end) : text.slice(0, 6000)).trim();
}

function decodeEntities(s) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", euro: "€", pound: "£", dollar: "$",
    rsquo: "'", lsquo: "'", rdquo: "\"", ldquo: "\"", ndash: "-", mdash: "-", hellip: "...", bull: "•",
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

async function extractBonus(text) {
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Bonus page text:\n\n${text}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: BONUS_SCHEMA,
      },
    }),
  );
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP") throw new Error(`Model stopped early (${finish})`);
  if (!response.text) throw new Error("Model returned no output");
  return JSON.parse(response.text);
}

// Retries transient server errors (e.g. 503 "high demand") with a growing delay.
async function withRetry(fn, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ApiError && err.status >= 500) || i === attempts) throw err;
      const delay = 5000 * i;
      console.warn(`  … model busy (HTTP ${err.status}), retrying in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Cheap checks against the raw text, so an LLM mistake shows up as a warning instead of silently shipping.
function sanityCheck(bonus, text) {
  const warnings = [];
  const stated = text.match(/Wagering Requirements (\d+)x/i)?.[1];
  if (stated && Number(stated) !== bonus.wagering_multiplier) {
    warnings.push(`wagering ${bonus.wagering_multiplier}x does not match page value ${stated}x`);
  }
  if (bonus.wagering_multiplier !== null && (bonus.wagering_multiplier <= 0 || bonus.wagering_multiplier > 200)) {
    warnings.push(`implausible wagering multiplier ${bonus.wagering_multiplier}`);
  }
  if (bonus.min_deposit !== null && !/^\d+(\.\d+)? [A-Z]{3,4}$/.test(bonus.min_deposit)) {
    warnings.push(`min_deposit "${bonus.min_deposit}" is not in "<amount> <CUR>" form`);
  }
  return warnings;
}

main().catch(async (err) => {
  console.error(`Scrape failed: ${err.message}`);
  // The JSON file is only written on success, so yesterday's data stays live.
  await notify(`❌ Casino scrape FAILED. The site still shows the previous data.\n\nError: ${err.message.slice(0, 500)}`);
  process.exit(1);
});
