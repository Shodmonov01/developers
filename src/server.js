import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";

import { STATUSES } from "./lib/callNotes.js";
import { extractDeveloperProfile } from "./lib/groq.js";
import { enrichDeveloperContacts } from "./lib/enrich.js";
import {
  deleteDeveloper,
  ensureDataDirs,
  exportCsv,
  getDeveloper,
  getScreenshotPath,
  listDevelopers,
  resolveDataRoot,
  saveCallNotes,
  saveProfile,
  setCalled,
  setPhone,
  setStatus,
} from "./lib/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STATIC_DIR = path.join(ROOT, "static");
const DATA_ROOT = resolveDataRoot(ROOT);
const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;

await ensureDataDirs(DATA_ROOT);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter(_req, file, cb) {
    if (!file.mimetype?.startsWith("image/")) {
      cb(new Error("Upload an image screenshot"));
      return;
    }
    cb(null, true);
  },
});

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/meta", (_req, res) => {
  res.json({ statuses: STATUSES });
});

app.use("/static", express.static(STATIC_DIR));
app.get("/", (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.get("/api/developers", async (_req, res) => {
  res.json(await listDevelopers(DATA_ROOT));
});

app.get("/api/developers/export.csv", async (_req, res) => {
  const csv = await exportCsv(DATA_ROOT);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="developers.csv"',
  );
  res.send(`\uFEFF${csv}`);
});

app.get("/api/developers/:id", async (req, res) => {
  const record = await getDeveloper(DATA_ROOT, req.params.id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(record);
});

app.get("/api/developers/:id/screenshot", async (req, res) => {
  const screenshotPath = await getScreenshotPath(DATA_ROOT, req.params.id);
  if (!screenshotPath || !fs.existsSync(screenshotPath)) {
    res.status(404).json({ error: "Screenshot not found" });
    return;
  }
  res.sendFile(path.resolve(screenshotPath));
});

app.patch("/api/developers/:id/called", async (req, res) => {
  const updated = await setCalled(DATA_ROOT, req.params.id, Boolean(req.body?.called));
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

app.patch("/api/developers/:id/status", async (req, res) => {
  const updated = await setStatus(DATA_ROOT, req.params.id, req.body?.status);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

app.patch("/api/developers/:id/phone", async (req, res) => {
  const updated = await setPhone(DATA_ROOT, req.params.id, req.body?.phone);
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

app.put("/api/developers/:id/call-notes", async (req, res) => {
  try {
    const updated = await saveCallNotes(DATA_ROOT, req.params.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.delete("/api/developers/:id", async (req, res) => {
  const ok = await deleteDeveloper(DATA_ROOT, req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/extract", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || "Upload failed" });
      return;
    }
    if (!req.file?.buffer?.length) {
      res.status(400).json({ error: "Empty file" });
      return;
    }

    const filename = req.file.originalname || "screenshot.png";

    try {
      const profile = await extractDeveloperProfile(req.file.buffer, filename);
      await enrichDeveloperContacts(profile);
      const row = await saveProfile(
        DATA_ROOT,
        profile,
        req.file.buffer,
        filename,
      );
      const hint = profile._meta?.contact_enrichment?.hint;
      res.json({
        ...row,
        hint: hint || null,
        message: row.upserted
          ? `Обновлён существующий: ${row.name}`
          : `Добавлен: ${row.name}`,
      });
    } catch (e) {
      const status = e.status || 502;
      const message = e.message || String(e);
      res.status(status).json({ error: `Groq error: ${message}` });
    }
  });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Developer Profiler on http://0.0.0.0:${port}`);
});
