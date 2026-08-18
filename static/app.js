const fileInput = document.getElementById("file");
const pick = document.getElementById("pick");
const dropzone = document.getElementById("dropzone");
const statusEl = document.getElementById("status");
const openUploadBtn = document.getElementById("open-upload");
const openManualBtn = document.getElementById("open-manual");
const uploadModal = document.getElementById("upload-modal");
const uploadClose = document.getElementById("upload-close");
const uploadBackdrop = document.getElementById("upload-backdrop");
const tabScreen = document.getElementById("tab-screen");
const tabManual = document.getElementById("tab-manual");
const manualForm = document.getElementById("manual-form");
const manualStatus = document.getElementById("manual-status");
const manualSubmit = document.getElementById("manual-submit");
const enrichBtn = document.getElementById("enrich-btn");
const enrichStatus = document.getElementById("enrich-status");
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

function applyTelegramInsets(tg) {
  const safe = tg.safeAreaInset || {};
  const content = tg.contentSafeAreaInset || {};
  const root = document.documentElement;
  if (safe.top != null) root.style.setProperty("--safe-top", `${safe.top}px`);
  if (safe.bottom != null) root.style.setProperty("--safe-bottom", `${safe.bottom}px`);
  if (safe.left != null) root.style.setProperty("--safe-left", `${safe.left}px`);
  if (safe.right != null) root.style.setProperty("--safe-right", `${safe.right}px`);
  root.style.setProperty("--tg-content-top", `${content.top || 0}px`);
  root.style.setProperty("--tg-content-bottom", `${content.bottom || 0}px`);
  if (tg.themeParams?.bg_color) {
    root.style.setProperty("--tg-bg", tg.themeParams.bg_color);
  }
}

function initTelegramMiniApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return null;

  document.documentElement.classList.add("tg-miniapp");
  try {
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
    if (typeof tg.setHeaderColor === "function") tg.setHeaderColor("secondary_bg_color");
    if (typeof tg.setBackgroundColor === "function") {
      tg.setBackgroundColor(tg.themeParams?.bg_color || "#f7f1e8");
    }
  } catch {
    // older clients
  }

  applyTelegramInsets(tg);
  tg.onEvent?.("safeAreaChanged", () => applyTelegramInsets(tg));
  tg.onEvent?.("contentSafeAreaChanged", () => applyTelegramInsets(tg));
  tg.onEvent?.("viewportChanged", () => applyTelegramInsets(tg));
  return tg;
}

initTelegramMiniApp();

function setAddTab(which) {
  const isManual = which === "manual";
  tabScreen.classList.toggle("is-active", !isManual);
  tabManual.classList.toggle("is-active", isManual);
  tabScreen.setAttribute("aria-selected", String(!isManual));
  tabManual.setAttribute("aria-selected", String(isManual));
  dropzone.classList.toggle("hidden", isManual);
  manualForm.classList.toggle("hidden", !isManual);
}

function openUpload(tab = "screen") {
  setAddTab(tab);
  uploadModal.classList.remove("hidden");
  uploadModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  if (tab === "manual") {
    manualForm.elements.namedItem("name")?.focus();
  }
}

function closeUpload() {
  uploadModal.classList.add("hidden");
  uploadModal.setAttribute("aria-hidden", "true");
  if (modal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

openUploadBtn.addEventListener("click", () => openUpload("screen"));
openManualBtn.addEventListener("click", () => openUpload("manual"));
tabScreen.addEventListener("click", () => setAddTab("screen"));
tabManual.addEventListener("click", () => setAddTab("manual"));
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

manualForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(manualForm);
  const body = {
    name: String(fd.get("name") || "").trim(),
    handle: String(fd.get("handle") || "").trim(),
    phone: String(fd.get("phone") || "").trim(),
    website: String(fd.get("website") || "").trim(),
    telegram: String(fd.get("telegram") || "").trim(),
    notes: String(fd.get("notes") || "").trim(),
    enrich: Boolean(fd.get("enrich")),
  };
  if (!body.name && !body.handle) {
    manualStatus.textContent = "Укажи название или Instagram";
    return;
  }

  manualSubmit.disabled = true;
  manualStatus.textContent = body.enrich
    ? "Ищу данные в сети… это может занять минуту"
    : "Создаю карточку…";
  try {
    const r = await fetch("/api/developers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Не удалось создать");
    manualForm.reset();
    const enrichEl = manualForm.elements.namedItem("enrich");
    if (enrichEl) enrichEl.checked = true;
    closeUpload();
    toast(data.message || `Добавлен: ${data.name}`);
    await loadTable();
    if (data.id) openCard(data.id);
  } catch (err) {
    manualStatus.textContent = err.message || String(err);
  } finally {
    manualSubmit.disabled = false;
  }
});

enrichBtn.addEventListener("click", async () => {
  const id = cardId.value;
  if (!id) return;
  enrichBtn.disabled = true;
  enrichStatus.textContent = "Ищу в сети…";
  try {
    const r = await fetch(`/api/developers/${id}/enrich`, { method: "POST" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Не удалось найти данные");
    enrichStatus.textContent = data.message || "Готово";
    toast(data.phone ? `Нашли: ${data.phone}` : data.message || "Данные обновлены");
    await loadTable();
    await openCard(id);
  } catch (err) {
    enrichStatus.textContent = err.message || String(err);
  } finally {
    enrichBtn.disabled = false;
  }
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
  enrichStatus.textContent = "";
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

  const tgCandidates = [
    ...(dev.telegram_handles || []),
    ...(webInfo?.telegram || []),
  ]
    .map((t) => String(t).replace(/^@/, "").toLowerCase())
    .filter((t) => t && !["facebook", "instagram", "share", "joinchat"].includes(t));
  const tg = tgCandidates[0];
  if (tg) {
    cardTg.href = `https://t.me/${tg}`;
    cardTg.style.display = "";
  } else {
    cardTg.style.display = "none";
  }

  const notes = data.call_notes || {};
  const auto = suggestNotesFromProfile(data.profile, webInfo);
  for (const name of NOTE_FIELDS) {
    const el = cardForm.elements.namedItem(name);
    if (!el) continue;
    let value = String(notes[name] || "").trim();
    if (!value && auto[name]) value = auto[name];
    if (name === "next_call_at" && value) value = toLocalInput(value);
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

/** Pull sqm range like "42,8 м² - 82,2 м²" out of free text. */
function extractSqm(text) {
  if (!text) return null;
  const m = String(text).match(
    /(\d+[.,]?\d*\s*(?:м²|м2|кв\.?\s*м)(?:\s*[-–—]\s*\d+[.,]?\d*\s*(?:м²|м2|кв\.?\s*м))?)/i,
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function collectProjects(profile, webInfo) {
  const proj = profile?.project || {};
  const list = [];
  for (const p of webInfo?.projects || []) {
    if (p?.name) list.push(p);
  }
  for (const p of proj.projects_details || []) {
    if (p?.name && !list.some((x) => x.name === p.name)) list.push(p);
  }
  for (const name of proj.mentioned_project_names || []) {
    if (name && !list.some((x) => x.name === name)) list.push({ name });
  }
  return list;
}

/** Map vision/web enrichment into empty call-note fields. */
function suggestNotesFromProfile(profile, webInfo) {
  const out = {
    project_name: "",
    location: "",
    handover: "",
    available_sqm: "",
    price_from: "",
    installment_months: "",
    down_payment: "",
    mortgage: "",
    call_result: "",
    next_call_at: "",
    notes: "",
  };
  if (!profile) return out;

  const proj = profile.project || {};
  const dev = profile.developer || {};
  const projects = collectProjects(profile, webInfo);
  const first = projects[0] || null;

  out.project_name = firstNonEmpty(
    first?.name,
    (proj.mentioned_project_names || [])[0],
  );

  out.location = firstNonEmpty(
    first?.location,
    (proj.location_hints || [])[0],
    (dev.cities || [])[0],
    webInfo?.address,
    dev.address,
  );

  out.handover = firstNonEmpty(
    first?.handover,
    (proj.handover_hints || [])[0],
  );

  out.available_sqm = firstNonEmpty(
    first?.sizes && extractSqm(first.sizes) ? extractSqm(first.sizes) : first?.sizes,
    ...(proj.apartment_sizes_hints || []).map((h) => extractSqm(h) || h),
    ...projects.map((p) => extractSqm(p.sizes) || extractSqm([p.name, p.location, p.sizes].filter(Boolean).join(" · "))),
  );

  // also scan joined project line (e.g. "66 Avenue — Новый Узбекистан · 42,8 м² - 82,2 м²")
  if (!out.available_sqm && first) {
    out.available_sqm =
      extractSqm(
        [first.name, first.location, first.sizes, first.price_from, first.handover]
          .filter(Boolean)
          .join(" · "),
      ) || "";
  }

  out.price_from = firstNonEmpty(
    first?.price_from,
    (proj.price_hints || [])[0],
  );

  const paymentBits = [
    ...(proj.payment_terms_hints || []),
    ...(webInfo?.offers || []),
  ].join(" ");

  const months = paymentBits.match(/(\d{1,2})\s*(?:мес|месяц)/i);
  if (months) out.installment_months = months[1];

  const down = paymentBits.match(
    /(?:первый\s*взнос|перв\.?\s*взнос|взнос)\s*[:\-]?\s*(\d+\s*%?)/i,
  );
  if (down) out.down_payment = down[1].includes("%") ? down[1] : `${down[1]}%`;

  if (/ипотек/i.test(paymentBits)) {
    const m = paymentBits.match(/ипотек[а-я]*[^.;,]{0,40}/i);
    out.mortgage = m ? m[0].trim() : "есть";
  }

  const extras = [];
  if (webInfo?.about_ru) extras.push(webInfo.about_ru);
  else if (profile.summary_ru) extras.push(profile.summary_ru);
  if ((webInfo?.offers || []).length) {
    extras.push(`Акции: ${webInfo.offers.filter(Boolean).slice(0, 3).join("; ")}`);
  }
  if ((dev.emails || []).length) extras.push(`Email: ${dev.emails[0]}`);
  out.notes = extras.join("\n\n");

  return out;
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
