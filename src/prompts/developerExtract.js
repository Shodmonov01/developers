/**
 * Промпт для извлечения профиля застройщика со скриншота через Groq Vision.
 */

export const SYSTEM_PROMPT = `You are an OSINT analyst for real-estate developers.
Extract developer data from screenshots of Instagram ads OR Instagram profile pages.
Do not invent phones, websites, addresses, or tax IDs.
If a phone is visible anywhere (bio, caption, overlay, near 📞), put it in developer.phones EXACTLY as digits (e.g. +998555009100).
Unknown fields: null or []. Distinguish developer vs project vs realtor vs agency.
website_candidates: ONLY domains clearly visible on the screenshot — never guess.
Return ONE JSON object only. No markdown. Fill ALL top-level keys.`;

export const USER_PROMPT = `Analyze this screenshot (Instagram ad or profile) of a real-estate developer.
Return JSON with exactly these top-level keys:

source: {platform, content_type, is_paid_ad, ui_language, screenshot_notes}
developer: {legal_or_brand_name, name_variants, instagram_handle, other_handles, is_verified, website_candidates, emails, phones, country, cities, languages_used, entity_type, confidence}
project: {mentioned_project_names, segment, stage_hints, usp_keywords_original, usp_keywords_ru, usp_keywords_en, price_hints, location_hints, confidence}
marketing: {overlay_texts, caption_full_or_visible, caption_truncated, slogans, cta_visible, tone}
engagement: {likes, comments, shares, saves, views, follower_social_proof_text, follower_count_hint, mentioned_followers}
visual: {scene_type, has_architectural_model, has_spokesperson, spokesperson_description, logo_description, brand_colors, production_quality, notable_objects}
risk_and_signals: {trust_claims, missing_critical_info, possible_confusion}
enrichment: {primary_identifiers, followup_search_queries, suggested_next_sources}
raw_ocr: {all_readable_text, uncertain_readings}
summary_ru: string
extraction_confidence_overall: number

Critical:
- OCR EVERY visible character into raw_ocr.all_readable_text (bio, phone, hours, links).
- phones: array of strings; include numbers like +998555009100 even without spaces.
- If this is a profile page, prioritize bio phone next to 📞.
- Do NOT invent mezana.uz-style websites. Leave website_candidates empty if not visible.
- slogans items: {original, lang, translation_ru, translation_en}. country like UZ/KZ/RU.`;
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
