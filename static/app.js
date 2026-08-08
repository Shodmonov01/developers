const fileInput = document.getElementById("file");
const pick = document.getElementById("pick");
const dropzone = document.getElementById("dropzone");
const statusEl = document.getElementById("status");
const openUploadBtn = document.getElementById("open-upload");
const uploadModal = document.getElementById("upload-modal");
const uploadClose = document.getElementById("upload-close");
const uploadBackdrop = document.getElementById("upload-backdrop");
const tbody = document.getElementById("tbody");
const mobileCards = document.getElementById("mobile-cards");
const statsEl = document.getElementById("stats");
const searchEl = document.getElementById("search");
const filterStatus = document.getElementById("filter-status");
const filterPhone = document.getElementById("filter-phone");
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modal-close");
const modalBackdrop = document.getElementById("modal-backdrop");
const deleteBtn = document.getElementById("delete-btn");
const cardForm = document.getElementById("card-form");
const cardTitle = document.getElementById("card-title");
const cardMeta = document.getElementById("card-meta");
const cardId = document.getElementById("card-id");
const cardSaveStatus = document.getElementById("card-save-status");
const cardPhone = document.getElementById("card-phone");
const cardStatus = document.getElementById("card-status");
const cardIg = document.getElementById("card-ig");
const cardTel = document.getElementById("card-tel");
const cardSite = document.getElementById("card-site");
const cardTg = document.getElementById("card-tg");
const cardInfo = document.getElementById("card-info");
const cardShot = document.getElementById("card-shot");
const cardShotLink = document.getElementById("card-shot-link");
const uploadQueueEl = document.getElementById("upload-queue");
const toastEl = document.getElementById("toast");

const NOTE_FIELDS = [
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
];

let statuses = [];
let allRows = [];
let toastTimer = null;

function openUpload() {
  uploadModal.classList.remove("hidden");
  uploadModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeUpload() {
  uploadModal.classList.add("hidden");
  uploadModal.setAttribute("aria-hidden", "true");
  if (modal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

openUploadBtn.addEventListener("click", openUpload);
uploadClose.addEventListener("click", closeUpload);
uploadBackdrop.addEventListener("click", closeUpload);

pick.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) enqueueFiles(fileInput.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  });
});
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) enqueueFiles(e.dataTransfer.files);
});

searchEl.addEventListener("input", renderTable);
filterStatus.addEventListener("change", renderTable);
filterPhone.addEventListener("change", renderTable);

modalClose.addEventListener("click", closeCard);
modalBackdrop.addEventListener("click", closeCard);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!modal.classList.contains("hidden")) closeCard();
  else if (!uploadModal.classList.contains("hidden")) closeUpload();
});

deleteBtn.addEventListener("click", async () => {
  const id = cardId.value;
  if (!id) return;
  if (!confirm("Удалить застройщика и его карточку?")) return;
  const r = await fetch(`/api/developers/${id}`, { method: "DELETE" });
  const data = await r.json();
  if (!r.ok) {
    toast(data.error || "Не удалось удалить");
    return;
  }
  closeCard();
  toast("Удалено");
  await loadTable();
});

cardForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = cardId.value;
  if (!id) return;

  const body = {
    phone: cardPhone.value.trim(),
    status: cardStatus.value,
  };
  for (const name of NOTE_FIELDS) {
    const el = cardForm.elements.namedItem(name);
    body[name] = el ? el.value : "";
  }

  cardSaveStatus.textContent = "Сохраняю…";
  try {
    const r = await fetch(`/api/developers/${id}/call-notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Ошибка сохранения");
    cardSaveStatus.textContent = "Сохранено";
    toast(`Сохранено: ${data.name}`);
    await loadTable();
  } catch (err) {
    cardSaveStatus.textContent = err.message || String(err);
  }
});

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2800);
}

function statusLabel(id) {
  return statuses.find((s) => s.id === id)?.label || id || "Новый";
}

async function initMeta() {
  const res = await fetch("/api/meta");
  const data = await res.json();
  statuses = data.statuses || [];

  filterStatus.innerHTML = '<option value="all">Все статусы</option>';
  cardStatus.innerHTML = "";
  for (const s of statuses) {
    filterStatus.insertAdjacentHTML(
      "beforeend",
      `<option value="${s.id}">${escapeHtml(s.label)}</option>`,
    );
    cardStatus.insertAdjacentHTML(
      "beforeend",
      `<option value="${s.id}">${escapeHtml(s.label)}</option>`,
    );
  }
}

// ---- Upload queue: several screenshots, processed one by one ----

const uploadQueue = [];
let uploading = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function enqueueFiles(fileList) {
  const images = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!images.length) {
    toast("Нужны изображения (PNG / JPG)");
    return;
  }
  for (const file of images) {
    uploadQueue.push({ file, state: "wait", note: "" });
  }
  renderQueue();
  processQueue();
}

function queueIcon(state) {
  if (state === "run") return '<span class="q-spin"></span>';
  if (state === "done") return '<span class="q-ok">✓</span>';
  if (state === "error") return '<span class="q-err">✕</span>';
  return '<span class="q-wait">•</span>';
}

function renderQueue() {
  if (!uploadQueue.length) {
    uploadQueueEl.classList.add("hidden");
    uploadQueueEl.innerHTML = "";
    return;
  }
  uploadQueueEl.classList.remove("hidden");
  uploadQueueEl.innerHTML = uploadQueue
    .map(
      (job) => `
      <li class="q-item q-${job.state}">
        ${queueIcon(job.state)}
        <span class="q-name">${escapeHtml(job.file.name)}</span>
        <span class="q-note">${escapeHtml(job.note || "")}</span>
      </li>`,
    )
    .join("");
}

async function uploadOne(file) {
  const attempt = async () => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/extract", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  let { res, data } = await attempt();
  // Groq rate limit — wait and retry once
  if (res.status === 429 || /rate.?limit|429/i.test(data.error || "")) {
    await sleep(22_000);
    ({ res, data } = await attempt());
  }
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
  return data;
}

async function processQueue() {
  if (uploading) return;
  uploading = true;
  pick.disabled = true;

  let lastId = null;
  while (true) {
    const job = uploadQueue.find((j) => j.state === "wait");
    if (!job) break;

    const pos = uploadQueue.filter((j) => j.state !== "wait").length + 1;
    statusEl.textContent = `Обрабатываю ${pos} из ${uploadQueue.length}: ${job.file.name}`;
    job.state = "run";
    renderQueue();

    try {
      const data = await uploadOne(job.file);
      job.state = "done";
      job.note = data.message || data.name || "готово";
      lastId = data.id || lastId;
      await loadTable();
    } catch (err) {
      job.state = "error";
      job.note = err.message || String(err);
    }
    renderQueue();

    // пауза между файлами, чтобы не упереться в лимиты Groq
    if (uploadQueue.some((j) => j.state === "wait")) await sleep(2000);
  }

  const done = uploadQueue.filter((j) => j.state === "done").length;
  const failed = uploadQueue.filter((j) => j.state === "error").length;
  statusEl.textContent = failed
    ? `Готово: ${done}, с ошибкой: ${failed}`
    : `Готово: ${done} из ${uploadQueue.length}`;
  toast(statusEl.textContent);

  uploading = false;
  pick.disabled = false;

  if (done === 1 && uploadQueue.length === 1 && lastId) {
    uploadModal.classList.add("hidden");
    uploadModal.setAttribute("aria-hidden", "true");
    openCard(lastId);
  } else if (!failed) {
    closeUpload();
  }

  setTimeout(() => {
    if (!uploading && !uploadQueue.some((j) => j.state === "wait")) {
      uploadQueue.length = 0;
      renderQueue();
      statusEl.textContent = "";
    }
  }, 8000);
}

function renderStats(rows) {
  const total = rows.length;
  const withPhone = rows.filter((r) => r.phone).length;
  const talked = rows.filter((r) => r.status === "talked").length;
  const todo = rows.filter((r) =>
    ["new", "no_answer", "callback"].includes(r.status),
  ).length;

  statsEl.innerHTML = `
    <div class="stat"><b>${total}</b><span>Всего</span></div>
    <div class="stat"><b>${withPhone}</b><span>С телефоном</span></div>
    <div class="stat"><b>${todo}</b><span>В работе</span></div>
    <div class="stat"><b>${talked}</b><span>Дозвонились</span></div>
  `;
}

function filteredRows() {
  const q = searchEl.value.trim().toLowerCase();
  const st = filterStatus.value;
  const ph = filterPhone.value;

  return allRows.filter((item) => {
    if (st !== "all" && item.status !== st) return false;
    if (ph === "with" && !item.phone) return false;
    if (ph === "without" && item.phone) return false;
    if (!q) return true;
    const hay = `${item.name} ${item.handle || ""} ${item.phone || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

async function savePhone(itemId, value, inputEl) {
  try {
    const r = await fetch(`/api/developers/${itemId}/phone`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: value.trim() }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Не сохранилось");
    if (inputEl) inputEl.value = data.phone || "";
    toast(data.phone ? `Телефон: ${data.phone}` : "Телефон очищен");
    await loadTable();
  } catch (err) {
    toast(err.message || String(err));
  }
}

function makePhoneInput(item) {
  const phoneInput = document.createElement("input");
  phoneInput.className = "phone-input";
  phoneInput.type = "tel";
  phoneInput.inputMode = "tel";
  phoneInput.placeholder = "вписать номер";
  phoneInput.value = item.phone || "";
  phoneInput.addEventListener("change", () => {
    savePhone(item.id, phoneInput.value, phoneInput);
  });
  return phoneInput;
}

function renderTable() {
  const items = filteredRows();
  renderStats(allRows);
  tbody.innerHTML = "";
  mobileCards.innerHTML = "";

  if (!items.length) {
    tbody.innerHTML =
      '<tr class="empty"><td colspan="4">Ничего не найдено</td></tr>';
    mobileCards.innerHTML = '<p class="empty-mobile">Ничего не найдено</p>';
    return;
  }

  for (const item of items) {
    const handle = item.handle ? item.handle.replace(/^@/, "") : null;
    const ig = handle
      ? `<a class="ig" href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${escapeHtml(handle)}</a>`
      : '<span class="muted">—</span>';
    const notesDot = item.has_notes
      ? '<span class="dot-notes" title="Есть заметки"></span>'
      : "";
    const badge = `<span class="badge ${escapeHtml(item.status || "new")}">${escapeHtml(statusLabel(item.status))}</span>`;

    // Desktop table row
    const tr = document.createElement("tr");
    tr.className = "row-clickable";
    tr.innerHTML = `
      <td><strong>${escapeHtml(item.name || "—")}</strong> ${notesDot}</td>
      <td>${ig}</td>
      <td class="phone-cell"></td>
      <td>${badge}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a, input, button, select")) return;
      openCard(item.id);
    });
    tr.querySelector(".phone-cell").appendChild(makePhoneInput(item));
    tbody.appendChild(tr);

    // Mobile list card
    const card = document.createElement("article");
    card.className = "dev-card";
    card.innerHTML = `
      <div class="dev-card-top">
        <div>
          <h3>${escapeHtml(item.name || "—")} ${notesDot}</h3>
          <p class="dev-card-ig">${ig}</p>
        </div>
        ${badge}
      </div>
      <label class="dev-card-phone">
        <span>Телефон</span>
      </label>
      <div class="dev-card-actions">
        ${
          item.phone
            ? `<a class="ghost-btn call-link" href="tel:${escapeHtml(String(item.phone).replace(/[^\d+]/g, ""))}">Позвонить</a>`
            : ""
        }
        <button type="button" class="upload-btn open-btn">Открыть</button>
      </div>
    `;
    card.querySelector(".dev-card-phone").appendChild(makePhoneInput(item));
    card.querySelector(".open-btn").addEventListener("click", () => openCard(item.id));
    card.addEventListener("click", (e) => {
      if (e.target.closest("a, input, button, select, label")) return;
      openCard(item.id);
    });
    mobileCards.appendChild(card);
  }
}

async function openCard(id) {
  cardSaveStatus.textContent = "";
  const res = await fetch(`/api/developers/${id}`);
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || "Не удалось открыть карточку");
    return;
  }

  cardId.value = data.id;
  cardTitle.textContent = data.name || "Застройщик";
  const handle = data.handle ? String(data.handle).replace(/^@/, "") : "";
  cardMeta.textContent = `${handle ? `@${handle}` : "без Instagram"} · обновлено ${formatDate(data.updated_at || data.call_notes?.updated_at || data.created_at)}`;

  cardPhone.value = data.phone || "";
  cardStatus.value = data.status || "new";

  if (handle) {
    cardIg.href = `https://instagram.com/${encodeURIComponent(handle)}`;
    cardIg.style.display = "";
  } else {
    cardIg.style.display = "none";
  }

  if (data.phone) {
    const tel = String(data.phone).replace(/[^\d+]/g, "");
    cardTel.href = `tel:${tel}`;
    cardTel.style.display = "";
  } else {
    cardTel.style.display = "none";
  }

  const dev = data.profile?.developer || {};
  const webInfo = data.profile?._meta?.contact_enrichment?.web_info || null;

  const site = firstWebsite(dev, webInfo);
  if (site) {
    cardSite.href = site;
    cardSite.style.display = "";
  } else {
    cardSite.style.display = "none";
  }

  const tg = (dev.telegram_handles || [])[0] || (webInfo?.telegram || [])[0];
  if (tg) {
    cardTg.href = `https://t.me/${String(tg).replace(/^@/, "")}`;
    cardTg.style.display = "";
  } else {
    cardTg.style.display = "none";
  }

  if (data.has_screenshot) {
    const src = `/api/developers/${data.id}/screenshot?t=${encodeURIComponent(data.updated_at || "")}`;
    cardShot.src = src;
    cardShotLink.href = src;
    cardShotLink.classList.remove("hidden");
  } else {
    cardShot.removeAttribute("src");
    cardShotLink.classList.add("hidden");
  }

  renderCardInfo(data.profile, webInfo);

  const notes = data.call_notes || {};
  for (const name of NOTE_FIELDS) {
    const el = cardForm.elements.namedItem(name);
    if (!el) continue;
    let value = notes[name] || "";
    if (name === "next_call_at" && value) {
      value = toLocalInput(value);
    }
    el.value = value;
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function firstWebsite(dev, webInfo) {
  const candidates = [
    webInfo?.website,
    ...(Array.isArray(dev.website_candidates) ? dev.website_candidates : []),
  ].filter(Boolean);
  for (const c of candidates) {
    let u = String(c).trim();
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
      return new URL(u).href;
    } catch {
      // try next
    }
  }
  return null;
}

function infoRow(label, value) {
  if (!value) return "";
  return `<div class="info-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function renderCardInfo(profile, webInfo) {
  if (!profile) {
    cardInfo.innerHTML = "";
    return;
  }
  const dev = profile.developer || {};
  const proj = profile.project || {};
  const parts = [];

  const about = webInfo?.about_ru || profile.summary_ru;
  if (about) parts.push(`<p class="info-about">${escapeHtml(about)}</p>`);

  parts.push(infoRow("Адрес", dev.address || webInfo?.address));
  parts.push(infoRow("Часы работы", dev.working_hours || webInfo?.working_hours));
  parts.push(infoRow("Email", (dev.emails || []).join(", ")));
  parts.push(infoRow("Telegram", (dev.telegram_handles || []).join(", ")));
  parts.push(
    infoRow("Ещё телефоны", (dev.phones || []).slice(1).join(", ")),
  );

  const projects = [];
  for (const p of webInfo?.projects || []) {
    if (p?.name) projects.push(p);
  }
  for (const p of proj.projects_details || []) {
    if (p?.name && !projects.some((x) => x.name === p.name)) projects.push(p);
  }
  const names = (proj.mentioned_project_names || []).filter(
    (n) => n && !projects.some((p) => p.name === n),
  );

  if (projects.length || names.length) {
    const items = [
      ...projects.map((p) => {
        const bits = [p.location, p.price_from, p.handover, p.sizes]
          .filter(Boolean)
          .join(" · ");
        return `<li><b>${escapeHtml(p.name)}</b>${bits ? ` — ${escapeHtml(bits)}` : ""}</li>`;
      }),
      ...names.map((n) => `<li><b>${escapeHtml(n)}</b></li>`),
    ];
    parts.push(
      `<div class="info-row"><span>Проекты</span><ul class="info-list">${items.join("")}</ul></div>`,
    );
  }

  const hints = [
    ...(proj.price_hints || []),
    ...(proj.payment_terms_hints || []),
    ...(proj.handover_hints || []),
    ...(proj.apartment_sizes_hints || []),
  ]
    .filter(Boolean)
    .slice(0, 8);
  if (hints.length) {
    parts.push(
      `<div class="info-row"><span>Цены и условия со скрина</span><ul class="info-list">${hints
        .map((h) => `<li>${escapeHtml(h)}</li>`)
        .join("")}</ul></div>`,
    );
  }

  const offers = (webInfo?.offers || []).filter(Boolean).slice(0, 5);
  if (offers.length) {
    parts.push(
      `<div class="info-row"><span>Акции</span><ul class="info-list">${offers
        .map((o) => `<li>${escapeHtml(o)}</li>`)
        .join("")}</ul></div>`,
    );
  }

  const html = parts.filter(Boolean).join("");
  cardInfo.innerHTML = html
    ? `<p class="info-title">Инфо из скрина и веба</p>${html}`
    : "";
}

function closeCard() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  if (uploadModal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

async function loadTable() {
  const res = await fetch("/api/developers");
  allRows = await res.json();
  renderTable();
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function toLocalInput(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

await initMeta();
await loadTable();
