import { emptyCallNotes, normalizeStatus } from "./callNotes.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function slug(value) {
  if (!value) return "unknown";
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 64) || "unknown";
}

function firstPhone(developer = {}) {
  const phones = Array.isArray(developer.phones) ? developer.phones : [];
  const first = phones.find((p) => p != null && String(p).trim());
  return first ? String(first).trim() : null;
}

function normHandle(handle) {
  if (!handle) return null;
  return String(handle).trim().replace(/^@/, "").toLowerCase() || null;
}

function indexPathFor(dataRoot) {
  return path.join(dataRoot, "developers", "index.json");
}

async function readIndex(dataRoot) {
  try {
    return JSON.parse(await fs.readFile(indexPathFor(dataRoot), "utf8"));
  } catch {
    return [];
  }
}

async function writeIndex(dataRoot, index) {
  await fs.writeFile(indexPathFor(dataRoot), JSON.stringify(index, null, 2), "utf8");
}

async function readRecord(folder) {
  return JSON.parse(await fs.readFile(path.join(folder, "profile.json"), "utf8"));
}

async function writeRecord(folder, record) {
  await fs.writeFile(
    path.join(folder, "profile.json"),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

function rowFromItem(item, extras = {}) {
  const status = normalizeStatus(item.status, { called: item.called });
  return {
    id: item.id,
    created_at: item.created_at,
    updated_at: item.updated_at || item.created_at,
    name: item.name || "—",
    handle: item.handle || null,
    phone: item.phone || null,
    status,
    called: status === "talked" || Boolean(item.called),
    country: item.country || null,
    has_notes: Boolean(item.has_notes),
    ...extras,
  };
}

export function resolveDataRoot(rootDir) {
  const fromEnv = (process.env.DATA_ROOT || "").trim();
  return fromEnv || path.join(rootDir, "data");
}

export async function ensureDataDirs(dataRoot) {
  await fs.mkdir(path.join(dataRoot, "developers"), { recursive: true });
  await fs.mkdir(path.join(dataRoot, "uploads"), { recursive: true });
}

function notesFilled(notes = {}) {
  return [
    "handover",
    "available_sqm",
    "installment_months",
    "mortgage",
    "call_result",
    "notes",
    "project_name",
  ].some((k) => String(notes[k] || "").trim());
}

export async function saveProfile(dataRoot, profile, imageBuffer, filename) {
  const developersDir = path.join(dataRoot, "developers");
  const developer = profile.developer || {};
  const name =
    developer.legal_or_brand_name || developer.instagram_handle || "unknown";
  const handle = normHandle(developer.instagram_handle);
  const phone = firstPhone(developer);
  const now = new Date().toISOString();
  const index = await readIndex(dataRoot);

  // Upsert by Instagram handle — avoid duplicates
  const existing = handle
    ? index.find((x) => normHandle(x.handle) === handle)
    : null;

  if (existing) {
    const folder = existing.folder;
    const full = await readRecord(folder);
    const ext = path.extname(filename || "").toLowerCase() || ".jpg";
    const imagePath = path.join(folder, `screenshot${ext}`);

    // remove old screenshot.* then write new
    try {
      const files = await fs.readdir(folder);
      await Promise.all(
        files
          .filter((f) => f.startsWith("screenshot."))
          .map((f) => fs.unlink(path.join(folder, f)).catch(() => {})),
      );
    } catch {
      // ignore
    }
    await fs.writeFile(imagePath, imageBuffer);

    full.profile = profile;
    full.screenshot_path = imagePath;
    full.updated_at = now;
    if (!full.call_notes) full.call_notes = emptyCallNotes();
    if (phone) {
      if (!full.profile.developer) full.profile.developer = {};
      const prev = Array.isArray(full.profile.developer.phones)
        ? full.profile.developer.phones
        : [];
      full.profile.developer.phones = [...new Set([phone, ...prev])];
    }
    await writeRecord(folder, full);

    Object.assign(existing, {
      name,
      handle,
      phone: phone || existing.phone || null,
      country: developer.country ?? existing.country ?? null,
      summary_ru: profile.summary_ru ?? existing.summary_ru ?? null,
      confidence: profile.extraction_confidence_overall ?? existing.confidence ?? null,
      updated_at: now,
      has_notes: notesFilled(full.call_notes),
      status: normalizeStatus(existing.status || full.status, {
        called: existing.called || full.called,
      }),
    });

    // move updated row to top
    const rest = index.filter((x) => x.id !== existing.id);
    await writeIndex(dataRoot, [existing, ...rest]);

    return {
      ...rowFromItem(existing),
      upserted: true,
      hint: null,
    };
  }

  const recordId = randomUUID();
  const stamp = now.replace(/[:.]/g, "-").slice(0, 19);
  const folder = path.join(
    developersDir,
    `${stamp}_${slug(name)}_${recordId.slice(0, 8)}`,
  );
  await fs.mkdir(folder, { recursive: true });

  const ext = path.extname(filename || "").toLowerCase() || ".png";
  const imagePath = path.join(folder, `screenshot${ext}`);
  await fs.writeFile(imagePath, imageBuffer);

  const record = {
    id: recordId,
    created_at: now,
    updated_at: now,
    screenshot_path: imagePath,
    called: false,
    status: "new",
    call_notes: emptyCallNotes(),
    profile,
  };
  await writeRecord(folder, record);

  const item = {
    id: recordId,
    created_at: now,
    updated_at: now,
    name,
    handle,
    phone,
    called: false,
    status: "new",
    country: developer.country ?? null,
    folder,
    summary_ru: profile.summary_ru ?? null,
    confidence: profile.extraction_confidence_overall ?? null,
    has_notes: false,
  };
  index.unshift(item);
  await writeIndex(dataRoot, index);

  return { ...rowFromItem(item), upserted: false };
}

export async function listDevelopers(dataRoot) {
  const index = await readIndex(dataRoot);
  let changed = false;

  const rows = await Promise.all(
    index.map(async (item) => {
      let phone = item.phone ?? null;
      let name = item.name ?? null;
      let handle = item.handle ?? null;
      let status = item.status;
      let hasNotes = item.has_notes;
      let updatedAt = item.updated_at || item.created_at;

      if (
        phone == null ||
        item.called == null ||
        !item.status ||
        item.has_notes == null
      ) {
        try {
          const full = await readRecord(item.folder);
          const developer = full.profile?.developer || {};
          if (phone == null) phone = firstPhone(developer);
          if (!name) name = developer.legal_or_brand_name || handle || "—";
          if (!handle) handle = normHandle(developer.instagram_handle);
          status = normalizeStatus(full.status || item.status, {
            called: full.called || item.called,
          });
          hasNotes = notesFilled(full.call_notes || {});
          updatedAt = full.updated_at || full.call_notes?.updated_at || updatedAt;
          changed = true;
          Object.assign(item, {
            phone,
            called: status === "talked",
            status,
            name,
            handle,
            has_notes: hasNotes,
            updated_at: updatedAt,
          });
        } catch {
          status = normalizeStatus(status, { called: item.called });
        }
      }

      return rowFromItem({
        ...item,
        phone,
        name,
        handle,
        status,
        has_notes: hasNotes,
        updated_at: updatedAt,
      });
    }),
  );

  if (changed) await writeIndex(dataRoot, index);
  return rows;
}

export async function getDeveloper(dataRoot, recordId) {
  const index = await readIndex(dataRoot);
  const item = index.find((x) => x.id === recordId);
  if (!item) return null;
  try {
    const full = await readRecord(item.folder);
    if (!full.call_notes) full.call_notes = emptyCallNotes();
    const status = normalizeStatus(full.status || item.status, {
      called: full.called || item.called,
    });
    return {
      ...full,
      name: item.name || full.profile?.developer?.legal_or_brand_name || "—",
      handle: item.handle || full.profile?.developer?.instagram_handle || null,
      phone: item.phone ?? firstPhone(full.profile?.developer) ?? null,
      status,
      called: status === "talked" || Boolean(full.called),
      has_screenshot: Boolean(full.screenshot_path),
    };
  } catch {
    return null;
  }
}

export async function getScreenshotPath(dataRoot, recordId) {
  const index = await readIndex(dataRoot);
  const item = index.find((x) => x.id === recordId);
  if (!item) return null;
  try {
    const full = await readRecord(item.folder);
    if (full.screenshot_path) return full.screenshot_path;
    const files = await fs.readdir(item.folder);
    const shot = files.find((f) => f.startsWith("screenshot."));
    return shot ? path.join(item.folder, shot) : null;
  } catch {
    return null;
  }
}

export async function setStatus(dataRoot, recordId, status) {
  const index = await readIndex(dataRoot);
  const item = index.find((x) => x.id === recordId);
  if (!item) return null;

  const next = normalizeStatus(status, { called: item.called });
  item.status = next;
  item.called = next === "talked";
  item.updated_at = new Date().toISOString();
  await writeIndex(dataRoot, index);

  try {
    const full = await readRecord(item.folder);
    full.status = next;
    full.called = next === "talked";
    full.updated_at = item.updated_at;
    await writeRecord(item.folder, full);
  } catch {
    // index ok
  }

  return rowFromItem(item);
}

export async function setCalled(dataRoot, recordId, called) {
  return setStatus(dataRoot, recordId, called ? "talked" : "new");
}

export async function setPhone(dataRoot, recordId, phone) {
  const index = await readIndex(dataRoot);
  const item = index.find((x) => x.id === recordId);
  if (!item) return null;

  const cleaned =
    phone == null || String(phone).trim() === ""
      ? null
      : String(phone).trim();
  item.phone = cleaned;
  item.updated_at = new Date().toISOString();
  await writeIndex(dataRoot, index);

  try {
    const full = await readRecord(item.folder);
    if (!full.profile) full.profile = {};
    if (!full.profile.developer) full.profile.developer = {};
    full.profile.developer.phones = cleaned ? [cleaned] : [];
    full.updated_at = item.updated_at;
    await writeRecord(item.folder, full);
  } catch {
    // index ok
  }

  return rowFromItem(item);
}

export async function saveCallNotes(dataRoot, recordId, notesInput = {}) {
  const index = await readIndex(dataRoot);
  const item = index.find((x) => x.id === recordId);
  if (!item) return null;

  const full = await readRecord(item.folder);
  const prev = full.call_notes || emptyCallNotes();
  const allowed = emptyCallNotes();

  const next = { ...prev };
  for (const key of Object.keys(allowed)) {
    if (key === "updated_at") continue;
    if (Object.prototype.hasOwnProperty.call(notesInput, key)) {
      next[key] = notesInput[key] == null ? "" : String(notesInput[key]);
    }
  }
  next.updated_at = new Date().toISOString();
  full.call_notes = next;
  full.updated_at = next.updated_at;

  if (Object.prototype.hasOwnProperty.call(notesInput, "status")) {
    full.status = normalizeStatus(notesInput.status, { called: full.called });
  } else if (notesFilled(next) && (!full.status || full.status === "new")) {
    full.status = "talked";
  }
  full.called = full.status === "talked";

  if (Object.prototype.hasOwnProperty.call(notesInput, "phone")) {
    const cleaned =
      notesInput.phone == null || String(notesInput.phone).trim() === ""
        ? null
        : String(notesInput.phone).trim();
    if (!full.profile) full.profile = {};
    if (!full.profile.developer) full.profile.developer = {};
    full.profile.developer.phones = cleaned ? [cleaned] : [];
    item.phone = cleaned;
  }

  await writeRecord(item.folder, full);

  item.status = full.status;
  item.called = full.called;
  item.has_notes = notesFilled(next);
  item.updated_at = full.updated_at;
  await writeIndex(dataRoot, index);

  return {
    ...rowFromItem(item),
    call_notes: next,
  };
}

export async function deleteDeveloper(dataRoot, recordId) {
  const index = await readIndex(dataRoot);
  const item = index.find((x) => x.id === recordId);
  if (!item) return false;

  await writeIndex(
    dataRoot,
    index.filter((x) => x.id !== recordId),
  );
  try {
    await fs.rm(item.folder, { recursive: true, force: true });
  } catch {
    // index already cleaned
  }
  return true;
}

export async function exportCsv(dataRoot) {
  const rows = await listDevelopers(dataRoot);
  const index = await readIndex(dataRoot);
  const byId = new Map(index.map((x) => [x.id, x]));

  const header = [
    "name",
    "instagram",
    "phone",
    "status",
    "project_name",
    "location",
    "handover",
    "available_sqm",
    "price_from",
    "installment_months",
    "down_payment",
    "mortgage",
    "call_result",
    "next_call_at",
    "notes",
    "created_at",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    const item = byId.get(row.id);
    let notes = emptyCallNotes();
    if (item?.folder) {
      try {
        const full = await readRecord(item.folder);
        notes = { ...emptyCallNotes(), ...(full.call_notes || {}) };
      } catch {
        // empty
      }
    }
    const values = [
      row.name,
      row.handle || "",
      row.phone || "",
      row.status,
      notes.project_name,
      notes.location,
      notes.handover,
      notes.available_sqm,
      notes.price_from,
      notes.installment_months,
      notes.down_payment,
      notes.mortgage,
      notes.call_result,
      notes.next_call_at,
      notes.notes,
      row.created_at,
    ].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`);
    lines.push(values.join(","));
  }
  return `${lines.join("\n")}\n`;
}
