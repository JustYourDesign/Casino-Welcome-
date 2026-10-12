// Minimal robots.txt checker: reads the group for our user agent (falling back to "*"),
// supports "*" and "$" wildcards, and applies the longest-match rule (Allow wins ties).

const cache = new Map();

export async function isAllowed(url, userAgent) {
  const { origin, pathname, search } = new URL(url);
  if (!cache.has(origin)) {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": userAgent } });
    if (res.status >= 500) throw new Error(`robots.txt unavailable for ${origin} (HTTP ${res.status})`);
    // 4xx means no robots.txt: everything is allowed.
    cache.set(origin, res.ok ? parse(await res.text(), userAgent) : []);
  }
  const path = pathname + search;
  let best = { length: -1, allow: true };
  for (const rule of cache.get(origin)) {
    if (rule.pattern.test(path) && rule.length >= best.length) {
      if (rule.length > best.length || rule.allow) best = rule;
    }
  }
  return best.allow;
}

function parse(text, userAgent) {
  const token = userAgent.split("/")[0].toLowerCase();
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === "user-agent") {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }

  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules).map((r) => ({
    allow: r.allow,
    length: r.path.length,
    pattern: toRegex(r.path),
  }));
}

function toRegex(path) {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}
