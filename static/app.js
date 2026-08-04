const fileInput = document.getElementById("file");
const pick = document.getElementById("pick");
const dropzone = document.getElementById("dropzone");
const statusEl = document.getElementById("status");
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

pick.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) upload(fileInput.files[0]);
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
  const file = e.dataTransfer?.files?.[0];
  if (file) upload(file);
});

searchEl.addEventListener("input", renderTable);
filterStatus.addEventListener("change", renderTable);
filterPhone.addEventListener("change", renderTable);

modalClose.addEventListener("click", closeCard);
modalBackdrop.addEventListener("click", closeCard);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeCard();
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

async function upload(file) {
  pick.disabled = true;
  statusEl.textContent = "Разбираю скриншот и ищу телефон…";
  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/api/extract", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка");
    const msg =
      data.message ||
      (data.phone
        ? `Добавлено: ${data.name} · ${data.phone}`
        : `Добавлено: ${data.name || "застройщик"}`);
    statusEl.textContent = data.hint ? `${msg}. ${data.hint}` : msg;
    toast(msg);
    await loadTable();
    if (data.id) openCard(data.id);
  } catch (err) {
    statusEl.textContent = err.message || String(err);
    toast(err.message || String(err));
  } finally {
    pick.disabled = false;
    fileInput.value = "";
  }
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

function closeCard() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
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
