// Telegram alerts through the Bot API (plain fetch, no extra dependency).
// Does nothing when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set, so local runs work without a bot.
//
// CLI:
//   node scraper/notify.js "message"   send a message (used by the GitHub Actions failure step)
//   node scraper/notify.js --chat-id   list chat IDs that have messaged the bot (setup helper)

import { pathToFileURL } from "node:url";

const API = "https://api.telegram.org/bot";

export async function notify(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;
  if (!token || !chatId) {
    console.log("Telegram not configured; skipping notification.");
    return;
  }
  try {
    const res = await fetch(`${API}${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: withRunLink(text), disable_web_page_preview: true }),
    });
    if (!res.ok) console.warn(`Telegram notification failed: HTTP ${res.status} ${await res.text()}`);
  } catch (err) {
    // An alert that can't be sent must never crash the scraper itself.
    console.warn(`Telegram notification failed: ${err.message}`);
  }
}

// On GitHub Actions, append a link to the run's log so the alert can be acted on from a phone.
function withRunLink(text) {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: runId } = process.env;
  return server && repo && runId ? `${text}\n\nLog: ${server}/${repo}/actions/runs/${runId}` : text;
}

async function printChatIds() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in .env first.");
  const res = await fetch(`${API}${token}/getUpdates`);
  const body = await res.json();
  if (!body.ok) throw new Error(`Telegram said: ${body.description}`);
  const chats = new Map();
  for (const update of body.result) {
    const chat = (update.message ?? update.channel_post ?? update.my_chat_member)?.chat;
    if (chat) chats.set(chat.id, chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" "));
  }
  if (chats.size === 0) {
    console.log("No chats yet. Open your bot in Telegram, send it any message, then run this again.");
    return;
  }
  for (const [id, name] of chats) console.log(`${id}  ${name}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv.slice(2).join(" ");
  if (arg === "--chat-id") {
    await printChatIds().catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
  } else {
    await notify(arg || "Test message from casino-bonus-scraper. Alerts are working.");
  }
}
