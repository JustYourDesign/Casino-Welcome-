# Casino bonus scraper

Scrapes the welcome bonus for 3 online casinos from [AskGamblers](https://www.askgamblers.com/casino-bonuses/welcome). Google Gemini turns each bonus page's free text into structured fields. The results are written to `data/casinos.json`, and the script generates a mobile-friendly static page in `docs/index.html`.

**Live page:** https://justyourdesign.github.io/Casino-Welcome-/ (mirror on Vercel: https://casino-bonus-scraper-five.vercel.app)

## Requirements

- Node.js 22 or newer
- A Google Gemini API key. The free tier is enough: create one at https://aistudio.google.com/apikey, no card needed.

## Install and run

```bash
npm install
cp .env.example .env      # then put your key in .env: GEMINI_API_KEY=...
npm run scrape
```

`npm run scrape` scrapes, extracts and writes `data/casinos.json`, then rebuilds `docs/index.html`. To rebuild only the page from the existing JSON, run `npm run render`.

## How it works

1. **Source.** It reads the AskGamblers welcome-bonus listing and collects links to individual bonus pages.
2. **Politeness.** Before every request it checks `robots.txt` (`scraper/robots.js`). Requests use an identifiable user-agent and are spaced 1.5 s apart. A 403/429 response or a robots.txt disallow is treated as "stop", never worked around.
3. **Cleaning.** Each bonus page is reduced to the plain text of its main offer. Navigation and the "similar offers" lists are cut so the model only sees the relevant terms.
4. **LLM extraction.** Gemini (`gemini-3.8-flash`, temperature 0; override it with `GEMINI_MODEL`) gets the text and returns JSON matching a strict schema (`responseJsonSchema`): casino, welcome bonus, wagering multiplier (and whether it applies to the bonus or deposit+bonus), and minimum deposit. If the page doesn't state a value, the model returns `null` rather than guessing. Temporary 5xx "model busy" errors are retried with backoff. A bad key or unknown model stops the run straight away.
5. **Sanity checks.** The wagering value is cross-checked against the page's own "Wagering Requirements Nx" label, and the formats and ranges are validated. Mismatches are printed as warnings.
6. **Output.** The source URL is attached in code, not by the model, so it is always the page that was actually fetched. Duplicate casinos are skipped until 3 unique ones are collected.

## Output format

```json
{
  "source": "AskGamblers",
  "scraped_at": "2026-10-12T10:00:00.000Z",
  "model": "gemini-3.8-flash",
  "casinos": [
    {
      "casino": "Example Casino",
      "welcome_bonus": "100% up to 500 EUR + 50 free spins",
      "wagering_multiplier": 35,
      "wagering_applies_to": "bonus",
      "min_deposit": "20 EUR",
      "source_url": "https://www.askgamblers.com/casino-bonuses/latest/..."
    }
  ]
}
```

## Project layout

```
scraper/scrape.js   fetch -> clean -> Gemini extraction -> data/casinos.json
scraper/robots.js   small robots.txt parser (wildcards, longest-match rule)
scraper/render.js   data/casinos.json -> docs/index.html
data/casinos.json   latest scrape output
docs/index.html     the published page (GitHub Pages serves /docs)
```

## Deploying

In the GitHub repo, go to **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/docs`. After each scrape, commit `data/` and `docs/` and push.

## Limitations

- The HTML selectors (the `<main>` element, the "Suggest an edit" cut-off) are tied to AskGamblers' current layout. If the layout changes, the run fails loudly rather than producing bad rows.
- Bonus terms can vary by country. The values reflect what AskGamblers serves to the scraping machine's location.
