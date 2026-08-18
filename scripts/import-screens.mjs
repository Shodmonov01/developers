/**
 * Import screenshots into Railway one-by-one.
 * Success → delete from screen-filter.
 * Fail / not-a-developer → move to screen-rejected.
 *
 * Usage:
 *   node scripts/import-screens.mjs --url https://developers-production-ad3f.up.railway.app
 *   node scripts/import-screens.mjs --url ... --limit 3 --delay 8000
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic"]);

function parseArgs(argv) {
  const out = {
    url: process.env.APP_URL || "",
    dir: path.join(ROOT, "screen-filter"),
    rejectDir: path.join(ROOT, "screen-rejected"),
    delayMs: Number(process.env.IMPORT_DELAY_MS) || 8000,
    limit: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--url" && next) {
      out.url = next;
      i += 1;
    } else if (a === "--dir" && next) {
      out.dir = path.resolve(next);
      i += 1;
    } else if (a === "--reject-dir" && next) {
      out.rejectDir = path.resolve(next);
      i += 1;
    } else if (a === "--delay" && next) {
      out.delayMs = Number(next);
      i += 1;
    } else if (a === "--limit" && next) {
      out.limit = Number(next);
      i += 1;
    }
  }
  out.url = String(out.url || "").replace(/\/+$/, "");
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mimeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function listImages(dir) {
  const names = await fs.readdir(dir);
  return names
    .filter((n) => IMAGE_EXT.has(path.extname(n).toLowerCase()))
    .sort()
    .map((n) => path.join(dir, n));
}

async function moveTo(filePath, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(filePath));
  await fs.rename(filePath, dest);
  return dest;
}

async function health(baseUrl) {
  const res = await fetch(`${baseUrl}/health`);
  if (!res.ok) throw new Error(`Health ${res.status}`);
  return res.json();
}

function looksLikeDeveloper(row) {
  const entity = String(row?.profile?.developer?.entity_type || "").toLowerCase();
  const name = String(row.name || "").toLowerCase();
  const handle = String(row.handle || "").toLowerCase();
  const summary = String(row?.profile?.summary_ru || "").toLowerCase();
  const hay = `${name} ${handle} ${summary} ${entity}`;
  if (["realtor", "agency", "broker"].includes(entity)) return false;
  if (/риелтор|риелторск|агентств недвижимости|realtor/.test(hay) && !/застройщик|жк|residence|жилой комплекс/.test(hay)) {
    return false;
  }
  return Boolean(row.name || row.handle);
}

async function extractOne(baseUrl, filePath) {
  const buf = await fs.readFile(filePath);
  const name = path.basename(filePath);
  const body = new FormData();
  body.append("file", new Blob([buf], { type: mimeFor(name) }), name);

  const attempt = async () => {
    const res = await fetch(`${baseUrl}/api/extract`, { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const isRateLimit = (res, data) =>
    res.status === 429 || /rate.?limit|429/i.test(String(data.error || ""));
  const isDailyLimit = (data) =>
    /tokens per day|TPD|try again in \d+m/i.test(String(data.error || ""));

  let { res, data } = await attempt();
  if (isRateLimit(res, data) && isDailyLimit(data)) {
    const err = new Error(data.error || "Groq daily token limit");
    err.code = "TPD";
    throw err;
  }
  if (isRateLimit(res, data)) {
    console.log("rate limit — жду 25с…");
    await sleep(25_000);
    ({ res, data } = await attempt());
  }
  if (isRateLimit(res, data) && isDailyLimit(data)) {
    const err = new Error(data.error || "Groq daily token limit");
    err.code = "TPD";
    throw err;
  }
  if (!res.ok) {
    const msg = String(data.error || `HTTP ${res.status}`);
    if (/JSON at position/i.test(msg)) {
      console.log("битый JSON — повтор через 5с…");
      await sleep(5_000);
      ({ res, data } = await attempt());
      if (isRateLimit(res, data) && isDailyLimit(data)) {
        const err = new Error(data.error || "Groq daily token limit");
        err.code = "TPD";
        throw err;
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }
    throw new Error(msg);
  }
  return data;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.url) {
    console.error("Нужен --url https://developers-production-ad3f.up.railway.app");
    process.exit(1);
  }

  await fs.mkdir(opts.rejectDir, { recursive: true });
  console.log(`Цель: ${opts.url}`);
  console.log(`Health: ${(await health(opts.url)).status || "ok"}`);

  const files = await listImages(opts.dir);
  const todo = opts.limit > 0 ? files.slice(0, opts.limit) : files;
  let added = 0;
  let updated = 0;
  let rejected = 0;

  console.log(`В очереди: ${todo.length} (всего в папке ${files.length})\n`);

  for (let i = 0; i < todo.length; i += 1) {
    const filePath = todo[i];
    const name = path.basename(filePath);
    process.stdout.write(`[${i + 1}/${todo.length}] ${name} … `);
    try {
      const row = await extractOne(opts.url, filePath);
      if (!looksLikeDeveloper(row)) {
        await moveTo(filePath, opts.rejectDir);
        rejected += 1;
        console.log(`не застройщик → screen-rejected (${row.name || "?"} @${row.handle || "—"})`);
      } else {
        await fs.unlink(filePath);
        if (row.upserted) updated += 1;
        else added += 1;
        const kind = row.upserted ? "обновлён" : "добавлен";
        console.log(`${kind}: ${row.name || "?"} ${row.phone || "без телефона"} — файл удалён`);
      }
    } catch (err) {
      if (err.code === "TPD" || /tokens per day|\bTPD\b/i.test(String(err.message || ""))) {
        console.log(`дневной лимит Groq — стоп. Файл остаётся в screen-filter.`);
        console.log(String(err.message || err).slice(0, 280));
        break;
      }
      await moveTo(filePath, opts.rejectDir).catch(() => {});
      rejected += 1;
      console.log(`ошибка → screen-rejected (${err.message || err})`);
    }
    if (i < todo.length - 1) await sleep(opts.delayMs);
  }

  console.log(
    `\nГотово. Добавлено: ${added}, обновлено: ${updated}, в screen-rejected: ${rejected}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
