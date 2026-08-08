/**
 * Промпт для извлечения профиля застройщика со скриншота через Groq Vision.
 */

export const SYSTEM_PROMPT = `You are an OSINT analyst for real-estate developers.
Extract developer data from screenshots of Instagram ads OR Instagram profile pages.
Do not invent phones, websites, addresses, emails, telegram handles, or tax IDs.
If a phone is visible anywhere (bio, caption, overlay, near 📞), put it in developer.phones EXACTLY as digits (e.g. +998555009100).
If an email, Telegram (@handle or t.me/...), address, working hours, or website is visible — extract it exactly as written.
Unknown fields: null or []. Distinguish developer vs project vs realtor vs agency.
website_candidates: ONLY domains clearly visible on the screenshot — never guess.
Return ONE JSON object only. No markdown. Fill ALL top-level keys.`;

export const USER_PROMPT = `Analyze this screenshot (Instagram ad or profile) of a real-estate developer.
Return JSON with exactly these top-level keys:

source: {platform, content_type, is_paid_ad, ui_language, screenshot_notes}
developer: {legal_or_brand_name, name_variants, instagram_handle, other_handles, telegram_handles, is_verified, website_candidates, emails, phones, address, working_hours, country, cities, languages_used, entity_type, years_on_market_hint, confidence}
project: {mentioned_project_names, projects_details, segment, stage_hints, usp_keywords_original, usp_keywords_ru, usp_keywords_en, price_hints, payment_terms_hints, location_hints, handover_hints, apartment_sizes_hints, confidence}
marketing: {overlay_texts, caption_full_or_visible, caption_truncated, slogans, cta_visible, tone, promo_offers}
engagement: {likes, comments, shares, saves, views, follower_social_proof_text, follower_count_hint, mentioned_followers}
visual: {scene_type, has_architectural_model, has_spokesperson, spokesperson_description, logo_description, brand_colors, production_quality, notable_objects}
risk_and_signals: {trust_claims, missing_critical_info, possible_confusion}
enrichment: {primary_identifiers, followup_search_queries, suggested_next_sources}
raw_ocr: {all_readable_text, uncertain_readings}
summary_ru: string
extraction_confidence_overall: number

Critical:
- OCR EVERY visible character into raw_ocr.all_readable_text (bio, phone, hours, links, prices, addresses).
- phones: array of strings; include numbers like +998555009100 even without spaces.
- If this is a profile page, prioritize bio phone next to 📞.
- telegram_handles: @handles or t.me/... links visible on screen.
- address: street/district/landmark if visible (e.g. "Ташкент, Юнусабад, ул. Амира Темура 12").
- working_hours: as written (e.g. "Пн-Сб 9:00-18:00").
- projects_details: array of {name, location, price_from, handover, sizes, notes} — one item per residential complex mentioned; null fields if unknown.
- price_hints: every price/installment/down-payment fragment exactly as written.
- payment_terms_hints: рассрочка / ипотека / первый взнос fragments.
- handover_hints: delivery dates ("сдача в 2026", "IV квартал").
- apartment_sizes_hints: metrage fragments ("от 34 м²", "1-4 комнатные").
- promo_offers: discounts, gifts, акции as written.
- Do NOT invent mezana.uz-style websites. Leave website_candidates empty if not visible.
- slogans items: {original, lang, translation_ru, translation_en}. country like UZ/KZ/RU.
- summary_ru: 2-4 предложения — кто застройщик, что продаёт, какие проекты/цены/условия видны.`;

export const EXPECTED_TOP_LEVEL_KEYS = [
  "source",
  "developer",
  "project",
  "marketing",
  "engagement",
  "visual",
  "risk_and_signals",
  "enrichment",
  "raw_ocr",
  "summary_ru",
  "extraction_confidence_overall",
];
