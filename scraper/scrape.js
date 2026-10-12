// Scrapes welcome bonuses for 3 casinos from AskGamblers and writes data/casinos.json.
// Pipeline: robots.txt check -> fetch listing -> fetch each bonus page -> clean text ->
// Claude extracts the structured fields -> sanity checks -> JSON file.

import { mkdir, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { isAllowed } from "./robots.js";

const LISTING_URL = "https://www.askgamblers.com/casino-bonuses/welcome";
const BONUS_LINK = /href="(\/casino-bonuses\/latest\/[^"#?]+)"/g;
const CASINO_COUNT = 3;
const MAX_CANDIDATES = 10;
const REQUEST_DELAY_MS = 1500;
const USER_AGENT = "casino-bonus-scraper/1.0 (+screening task; polite, robots.txt-aware)";
const MODEL = "claude-opus-5-5";
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

const client = new Anthropic();

async function main() {
  console.log(`Source: ${LISTING_URL}`);
  const listingHtml = await politeFetch(LISTING_URL);
  const links = [...new Set([...listingHtml.matchAll(BONUS_LINK)].map((m) => m[1]))]
    .slice(0, MAX_CANDIDATES)
    .map((path) => new URL(path, LISTING_URL).href);
  if (links.length === 0) throw new Error("No bonus links found on the listing page; the layout may have changed.");

  const casinos = [];
  for (const url of links) {
    if (casinos.length === CASINO_COUNT) break;
    try {
      const text = pageText(await politeFetch(url));
      const extracted = await extractBonus(text);
      if (casinos.some((c) => c.casino.toLowerCase() === extracted.casino.toLowerCase())) continue;
      for (const warning of sanityCheck(extracted, text)) console.warn(`  ! ${extracted.casino}: ${warning}`);
      casinos.push({ ...extracted, source_url: url });
      console.log(`  ✓ ${extracted.casino}: ${extracted.welcome_bonus} | ${extracted.wagering_multiplier}x | min ${extracted.min_deposit}`);
    } catch (err) {
      // Bad credentials or no credit will fail for every page, so stop instead of crawling on.
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw err;
      console.warn(`  ✗ Skipped ${url}: ${err.message}`);
    }
  }
  if (casinos.length < CASINO_COUNT) throw new Error(`Only extracted ${casinos.length}/${CASINO_COUNT} casinos.`);

  const output = { source: "AskGamblers", listing_url: LISTING_URL, scraped_at: new Date().toISOString(), model: MODEL, casinos };
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${casinos.length} casinos to data/casinos.json`);
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
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", euro: "€", pound: "£", dollar: "$" };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

async function extractBonus(text) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: jsonSchemaOutputFormat(BONUS_SCHEMA) },
    messages: [{ role: "user", content: `Bonus page text:\n\n${text}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Model declined the request");
  if (response.stop_reason === "max_tokens") throw new Error("Model output was truncated");
  if (!response.parsed_output) throw new Error("Model returned no parseable output");
  return response.parsed_output;
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

main().catch((err) => {
  console.error(`Scrape failed: ${err.message}`);
  process.exit(1);
});
