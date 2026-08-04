/** Call pipeline statuses for CRM table. */
export const STATUSES = [
  { id: "new", label: "Новый" },
  { id: "no_answer", label: "Не взяли" },
  { id: "callback", label: "Перезвонить" },
  { id: "talked", label: "Дозвонились" },
  { id: "refuse", label: "Отказ" },
];

export const STATUS_IDS = new Set(STATUSES.map((s) => s.id));

export function normalizeStatus(value, { called = false } = {}) {
  if (value && STATUS_IDS.has(value)) return value;
  return called ? "talked" : "new";
}

/** Empty questionnaire filled during sales calls. */
export function emptyCallNotes() {
  return {
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
    updated_at: null,
  };
}
