// "Ignored Names / Blacklist" setting: item and Active Effect names that are never logged.

import { MOD_ID } from "./constants.mjs";
import { getSetting, onSettingsChange } from "./settings.mjs";

// One blacklist entry: a /regex/flags token (which may contain commas) or plain text up to the next separator
const BLACKLIST_TOKEN = /\s*(\/(?:\\.|[^/\\\n])+\/[a-z]*)(?=\s*(?:[,\n]|$))|[^,\n]+/g;

let cachedBlacklist = null;
onSettingsChange(() => { cachedBlacklist = null; });

function parseBlacklist(raw) {
  const blacklist = { exact: new Set(), patterns: [] };
  if (!raw || typeof raw !== "string" || !raw.trim()) return blacklist;

  const entries = [...raw.matchAll(BLACKLIST_TOKEN)]
    .map(m => (m[1] ?? m[0]).trim())
    .filter(s => s.length > 0);

  for (const entry of entries) {
    // Regex pattern: /.../flags
    if (entry.startsWith("/") && entry.lastIndexOf("/") > 0) {
      const lastSlash = entry.lastIndexOf("/");
      try {
        blacklist.patterns.push(new RegExp(entry.slice(1, lastSlash), entry.slice(lastSlash + 1)));
        continue;
      } catch (e) {
        console.warn(`[${MOD_ID}] Invalid regex in name blacklist: "${entry}"`, e);
      }
    }

    // Wildcard pattern: contains * or ?
    if (entry.includes("*") || entry.includes("?")) {
      const escaped = entry
        .replace(/[-/\\^$+.()|[\]{}]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      blacklist.patterns.push(new RegExp(`^${escaped}$`, "i"));
      continue;
    }

    // Exact string match (case-insensitive)
    blacklist.exact.add(entry.toLowerCase());
  }

  return blacklist;
}

export function isNameBlacklisted(name) {
  if (!name) return false;
  cachedBlacklist ??= parseBlacklist(getSetting("nameBlacklist", ""));
  const { exact, patterns } = cachedBlacklist;
  if (!exact.size && !patterns.length) return false;
  const str = String(name).trim();
  if (exact.has(str.toLowerCase())) return true;
  return patterns.some(re => {
    // Global/sticky regexes keep state between test() calls
    re.lastIndex = 0;
    return re.test(str);
  });
}
