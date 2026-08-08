const UZ_PHONE_RE =
  /(?:\+998|998)[\s\-()]?\d{2}[\s\-()]?\d{3}[\s\-()]?\d{2}[\s\-()]?\d{2}/g;

const EMAIL_RE =
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const TELEGRAM_RE =
  /(?:t\.me\/|telegram\.me\/|телеграм[:\s@]+|telegram[:\s@]+)(@?[a-z0-9_]{4,32})/gi;

const SKIP_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "t.me",
  "telegram.me",
  "youtube.com",
  "www.youtube.com",
  "tiktok.com",
  "www.tiktok.com",
  "x.com",
  "twitter.com",
  "duckduckgo.com",
  "bing.com",
  "www.bing.com",
  "google.com",
  "www.google.com",
]);

export function normalizePhone(raw) {
  const onlyDigits = String(raw).replace(/\D/g, "");
  if (onlyDigits.length < 9) return null;

  if (onlyDigits.startsWith("998") && onlyDigits.length === 12) {
    return `+${onlyDigits.slice(0, 3)} ${onlyDigits.slice(3, 5)} ${onlyDigits.slice(5, 8)} ${onlyDigits.slice(8, 10)} ${onlyDigits.slice(10)}`;
  }
  if (onlyDigits.length === 9) {
    return `+998 ${onlyDigits.slice(0, 2)} ${onlyDigits.slice(2, 5)} ${onlyDigits.slice(5, 7)} ${onlyDigits.slice(7)}`;
  }
  if (onlyDigits.length >= 10 && onlyDigits.length <= 15) {
    return `+${onlyDigits}`;
  }
  return null;
}

export function extractPhonesFromText(text) {
  const found = new Set();
  const uz = String(text).match(UZ_PHONE_RE) || [];
  for (const raw of uz) {
    const normalized = normalizePhone(raw);
    if (normalized) found.add(normalized);
  }
  for (const m of String(text).matchAll(/tel:([+\d\s()-]{9,20})/gi)) {
    const normalized = normalizePhone(m[1]);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

export function extractEmailsFromText(text) {
  const found = new Set();
  for (const m of String(text).match(EMAIL_RE) || []) {
    const email = m.toLowerCase();
    // skip asset filenames picked up from html (logo@2x.png etc.)
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(email)) continue;
    found.add(email);
  }
  return [...found];
}

export function extractTelegramFromText(text) {
  const found = new Set();
  for (const m of String(text).matchAll(TELEGRAM_RE)) {
    const handle = m[1].replace(/^@/, "").toLowerCase();
    if (["joinchat", "share", "addstickers"].includes(handle)) continue;
    found.add(`@${handle}`);
  }
  return [...found];
}

/** Mine phones from every string already returned by vision OCR/JSON. */
export function extractPhonesFromProfile(profile) {
  const chunks = [];
  const walk = (v) => {
    if (typeof v === "string") chunks.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(profile);
  return extractPhonesFromText(chunks.join("\n"));
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function countryHint(profile) {
  const c = (profile?.developer?.country || "").toUpperCase();
  if (c === "UZ") return "Узбекистан";
  if (c === "KZ") return "Казахстан";
  if (c === "RU") return "Россия";
  return "Узбекистан";
}

function buildSearchQueries(profile) {
  const d = profile?.developer || {};
  const name = d.legal_or_brand_name || d.name_variants?.[0];
  const handle = d.instagram_handle?.replace(/^@/, "");
  const country = countryHint(profile);
  const queries = [];
  if (name) {
    queries.push(`${name} телефон ${country}`);
    queries.push(`"${name}" +998`);
    queries.push(`${name} застройщик контакты`);
  }
  if (handle) {
    queries.push(`${handle} телефон`);
    queries.push(`${handle} +998`);
    queries.push(`site:instagram.com ${handle} телефон`);
  }
  return [...new Set(queries)].slice(0, 6);
}

function candidateWebsiteUrls(profile) {
  const developer = profile?.developer || {};
  const urls = new Set();
  const ocr = JSON.stringify(profile?.raw_ocr || "");

  for (const c of developer.website_candidates || []) {
    if (!c) continue;
    let u = String(c).trim();
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
      const parsed = new URL(u);
      // Skip hallucinated domains unless they appear in OCR text
      const host = parsed.hostname.toLowerCase();
      if (!ocr.toLowerCase().includes(host) && !/\.(uz|kz|ru)$/i.test(host)) {
        // still allow .uz/.kz/.ru; others only if in OCR
      }
      if (parsed.hostname.includes(".")) {
        urls.add(`${parsed.origin}/`);
      }
    } catch {
      // skip
    }
  }

  const handle = developer.instagram_handle?.replace(/^@/, "");
  if (handle && /\.[a-z]{2,}$/i.test(handle)) {
    urls.add(`https://${handle}/`);
  }

  const expanded = [];
  for (const origin of urls) {
    expanded.push(origin);
    expanded.push(`${origin}contacts`);
    expanded.push(`${origin}contact`);
    expanded.push(`${origin}kontakty`);
  }
  return [...new Set(expanded)].slice(0, 8);
}

async function fetchRaw(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,uz,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const html = await fetchRaw(url);
  if (!html) return null;
  return stripHtml(html).slice(0, 120_000);
}

function parseSearchHtml(html) {
  const links = [];
  const snippets = [stripHtml(html).slice(0, 25000)];

  for (const m of html.matchAll(/uddg=([^&"]+)/g)) {
    try {
      const url = decodeURIComponent(m[1]);
      if (url.startsWith("http")) links.push(url);
    } catch {
      // skip
    }
  }
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    links.push(m[1]);
  }
  for (const m of html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)) {
    snippets.push(stripHtml(m[1]));
  }

  return {
    links: [...new Set(links)].filter((u) => {
      try {
        const host = new URL(u).hostname.toLowerCase();
        if (SKIP_HOSTS.has(host)) return false;
        if (host.includes("bing.") || host.includes("google.") || host.includes("yandex.")) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    }),
    snippets,
  };
}

async function searchWeb(query) {
  const engines = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  ];

  for (const url of engines) {
    const html = await fetchRaw(url, { timeoutMs: 12000 });
    if (!html) continue;
    // DDG captcha / empty
    if (html.includes("anomaly") || html.includes("challenge-form")) continue;
    const parsed = parseSearchHtml(html);
    const phones = extractPhonesFromText(parsed.snippets.join("\n"));
    if (parsed.links.length || phones.length) {
      return { ...parsed, phones, query, engine: url };
    }
  }
  return { links: [], snippets: [], phones: [], query };
}

/** Best-effort Instagram bio/phone — often blocked, but cheap to try. */
async function fetchInstagramProfile(handle) {
  if (!handle) return { phones: [], text: "", ok: false };
  const username = handle.replace(/^@/, "");
  const url = `https://www.instagram.com/${username}/`;
  const html = await fetchRaw(url, { timeoutMs: 12000 });
  if (!html) return { phones: [], text: "", ok: false, url };

  const phones = extractPhonesFromText(html);
  const bioMatch =
    html.match(/"biography"\s*:\s*"((?:\\.|[^"\\])*)"/) ||
    html.match(/"biography_with_entities"\s*:\s*\{[^}]*"raw_text"\s*:\s*"((?:\\.|[^"\\])*)"/);

  let bio = "";
  if (bioMatch?.[1]) {
    try {
      bio = JSON.parse(`"${bioMatch[1]}"`);
    } catch {
      bio = bioMatch[1];
    }
    phones.push(...extractPhonesFromText(bio));
  }

  return {
    phones: [...new Set(phones)],
    text: bio || stripHtml(html).slice(0, 5000),
    ok: true,
    url,
  };
}

async function pickBestPhoneWithGroq(companyName, candidates, evidenceText) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return candidates[0];

  try {
    const Groq = (await import("groq-sdk")).default;
    const client = new Groq({ apiKey });
    const model = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_completion_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Pick the official sales phone for a real-estate developer. Prefer numbers from Instagram bio or official site. JSON only.",
        },
        {
          role: "user",
          content: `Company: ${companyName}
Candidates: ${JSON.stringify(candidates)}
Evidence:
${evidenceText.slice(0, 6000)}

Return {"phone":"+998 .."|null,"confidence":0-1}`,
        },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(raw);
    return normalizePhone(data.phone) || data.phone || candidates[0];
  } catch {
    return candidates[0];
  }
}

/**
 * Summarize gathered web evidence into structured info:
 * address, working hours, projects with prices, extra contacts.
 */
async function summarizeWebInfoWithGroq(companyName, evidenceText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !evidenceText.trim()) return null;

  try {
    const Groq = (await import("groq-sdk")).default;
    const client = new Groq({ apiKey });
    const model = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_completion_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You extract structured facts about a real-estate developer from raw web page text.
Only use facts present in the evidence. Never invent. Unknown → null or [].
Answer in Russian where free text is needed. JSON only.`,
        },
        {
          role: "user",
          content: `Company: ${companyName}
Evidence (fragments from official site, Instagram bio, search results):
${evidenceText.slice(0, 12000)}

Return JSON:
{
 "address": string|null,
 "working_hours": string|null,
 "website": string|null,
 "emails": string[],
 "telegram": string[],
 "projects": [{"name": string, "location": string|null, "price_from": string|null, "handover": string|null, "sizes": string|null}],
 "offers": string[],
 "about_ru": string|null
}
about_ru: 1-2 предложения о компании из evidence (сколько лет, сколько проектов, специализация).`,
        },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content || "";
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return {
      address: data.address || null,
      working_hours: data.working_hours || null,
      website: data.website || null,
      emails: Array.isArray(data.emails) ? data.emails : [],
      telegram: Array.isArray(data.telegram) ? data.telegram : [],
      projects: Array.isArray(data.projects) ? data.projects : [],
      offers: Array.isArray(data.offers) ? data.offers : [],
      about_ru: data.about_ru || null,
    };
  } catch {
    return null;
  }
}

/** Enrich phones: OCR fields → Instagram profile → website → web search. */
export async function enrichDeveloperContacts(profile) {
  if (!profile.developer) profile.developer = {};
  if (!Array.isArray(profile.developer.phones)) profile.developer.phones = [];
  if (!Array.isArray(profile.developer.website_candidates)) {
    profile.developer.website_candidates = [];
  }

  const meta = {
    from_ocr: [],
    instagram: null,
    website_urls: [],
    search_queries: [],
    search_links: [],
    phones_found: [],
    emails_found: [],
    telegram_found: [],
    sources: [],
    groq_pick: null,
    web_info: null,
    hint: null,
  };

  const evidenceChunks = [];
  const collectContacts = (text, source) => {
    const emails = extractEmailsFromText(text);
    const tg = extractTelegramFromText(text);
    if (emails.length) meta.emails_found.push(...emails);
    if (tg.length) meta.telegram_found.push(...tg);
    if ((emails.length || tg.length) && source) meta.sources.push(source);
  };

  // 0) Phones already visible on the uploaded screenshot / OCR JSON
  const fromOcr = extractPhonesFromProfile(profile);
  meta.from_ocr = fromOcr;
  meta.phones_found.push(...fromOcr);
  if (fromOcr.length) meta.sources.push("screenshot_ocr");
  collectContacts(JSON.stringify(profile.raw_ocr || ""), "screenshot_ocr");

  // 1) Instagram profile (bio often has 📞 +998…)
  const handle = profile.developer.instagram_handle;
  if (handle) {
    const ig = await fetchInstagramProfile(handle);
    meta.instagram = {
      url: ig.url || `https://instagram.com/${handle.replace(/^@/, "")}`,
      ok: ig.ok,
      phones: ig.phones,
    };
    if (ig.phones?.length) {
      meta.phones_found.push(...ig.phones);
      meta.sources.push(ig.url || "instagram");
    }
    if (ig.text) {
      evidenceChunks.push(`INSTAGRAM BIO: ${ig.text.slice(0, 2000)}`);
      collectContacts(ig.text, ig.url || "instagram");
    }
  }

  // 2) Official website pages
  const siteUrls = candidateWebsiteUrls(profile);
  meta.website_urls = siteUrls;
  for (const url of siteUrls) {
    const text = await fetchText(url);
    if (!text) continue;
    evidenceChunks.push(`SOURCE ${url}: ${text.slice(0, 3500)}`);
    collectContacts(text, url);
    const phones = extractPhonesFromText(text);
    if (phones.length) {
      meta.phones_found.push(...phones);
      meta.sources.push(url);
    }
  }

  // 3) Web search (DDG + Bing fallback)
  const queries = buildSearchQueries(profile);
  meta.search_queries = queries;
  for (const query of queries) {
    const result = await searchWeb(query);
    meta.search_links.push(...result.links.slice(0, 5));
    meta.phones_found.push(...result.phones);
    evidenceChunks.push(
      `SEARCH "${query}": ${result.snippets.slice(0, 2).join(" | ").slice(0, 2000)}`,
    );
    for (const link of result.links.slice(0, 3)) {
      if (link.includes("instagram.com")) continue;
      const text = await fetchText(link);
      if (!text) continue;
      collectContacts(text, link);
      const phones = extractPhonesFromText(text);
      if (phones.length) {
        meta.phones_found.push(...phones);
        meta.sources.push(link);
        evidenceChunks.push(`SOURCE ${link}: ${text.slice(0, 2500)}`);
      }
    }
  }

  const uniquePhones = [...new Set(meta.phones_found.map((p) => normalizePhone(p) || p).filter(Boolean))];
  meta.phones_found = uniquePhones;
  meta.search_links = [...new Set(meta.search_links)].slice(0, 12);
  meta.sources = [...new Set(meta.sources)];

  const company =
    profile.developer.legal_or_brand_name ||
    profile.developer.instagram_handle ||
    "unknown";

  let best = uniquePhones[0] || null;
  if (uniquePhones.length > 0) {
    best = await pickBestPhoneWithGroq(
      company,
      uniquePhones,
      evidenceChunks.join("\n\n"),
    );
    meta.groq_pick = best;
  }

  if (!best && handle) {
    meta.hint =
      "Телефон часто только в bio Instagram. Загрузи скрин профиля или впиши номер вручную.";
  }

  const ordered = [
    ...new Set(
      [
        best,
        ...uniquePhones,
        ...profile.developer.phones.map((p) => normalizePhone(p) || p),
      ].filter(Boolean),
    ),
  ];
  profile.developer.phones = ordered.slice(0, 3);

  // 4) Structured summary of everything found on the web
  meta.emails_found = [...new Set(meta.emails_found)].slice(0, 5);
  meta.telegram_found = [...new Set(meta.telegram_found)].slice(0, 5);

  if (evidenceChunks.length) {
    meta.web_info = await summarizeWebInfoWithGroq(
      company,
      evidenceChunks.join("\n\n"),
    );
  }

  // Merge extra contacts into the developer profile (vision data has priority)
  const dev = profile.developer;
  dev.emails = [
    ...new Set([...(dev.emails || []), ...meta.emails_found, ...(meta.web_info?.emails || [])]),
  ].slice(0, 5);
  dev.telegram_handles = [
    ...new Set([
      ...(dev.telegram_handles || []),
      ...meta.telegram_found,
      ...(meta.web_info?.telegram || []),
    ]),
  ].slice(0, 5);
  if (!dev.address && meta.web_info?.address) dev.address = meta.web_info.address;
  if (!dev.working_hours && meta.web_info?.working_hours) {
    dev.working_hours = meta.web_info.working_hours;
  }
  if (meta.web_info?.website && !(dev.website_candidates || []).length) {
    dev.website_candidates = [meta.web_info.website];
  }

  profile._meta = {
    ...(profile._meta || {}),
    contact_enrichment: meta,
  };
  return profile;
}

export async function enrichFromWebsite(profile) {
  return enrichDeveloperContacts(profile);
}
