import Groq from "groq-sdk";
import {
  EXPECTED_TOP_LEVEL_KEYS,
  SYSTEM_PROMPT,
  USER_PROMPT,
} from "../prompts/developerExtract.js";
import { prepareImageForGroq } from "./image.js";

function parseJsonContent(content) {
  let text = (content || "").trim();
  if (!text) throw new Error("Empty model response");
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  const data = JSON.parse(text.slice(start, end + 1));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Model returned non-object JSON");
  }
  return data;
}

async function callGroq({ client, model, dataUrl, useJsonMode }) {
  return client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.1,
    max_completion_tokens: 4096,
    ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
  });
}

export async function extractDeveloperProfile(imageBuffer, filename) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const err = new Error("GROQ_API_KEY is not set");
    err.status = 500;
    throw err;
  }

  const model = process.env.GROQ_MODEL || "qwen/qwen3.6-27b";
  const prepared = await prepareImageForGroq(imageBuffer);
  const dataUrl = `data:${prepared.mime};base64,${prepared.buffer.toString("base64")}`;
  const client = new Groq({ apiKey });

  let completion;
  let usedJsonMode = true;
  try {
    completion = await callGroq({ client, model, dataUrl, useJsonMode: true });
    // empty content → retry without json mode
    if (!completion.choices?.[0]?.message?.content?.trim()) {
      throw new Error("empty json mode response");
    }
    // probe parse
    parseJsonContent(completion.choices[0].message.content);
  } catch {
    usedJsonMode = false;
    completion = await callGroq({ client, model, dataUrl, useJsonMode: false });
  }

  const choice = completion.choices?.[0];
  const raw = choice?.message?.content || "{}";
  const profile = parseJsonContent(raw);
  const missing = EXPECTED_TOP_LEVEL_KEYS.filter((k) => !(k in profile));

  profile._meta = {
    model,
    extracted_at: new Date().toISOString(),
    missing_top_level_keys: missing,
    source_filename: filename,
    finish_reason: choice?.finish_reason ?? null,
    json_mode: usedJsonMode,
    usage: completion.usage ?? null,
    image: {
      original_bytes: prepared.originalBytes,
      prepared_bytes: prepared.preparedBytes,
      original_size: prepared.originalSize,
    },
  };

  return profile;
}
