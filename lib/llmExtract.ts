import { CATEGORY_ORDER } from "./categories";
import { allEntries } from "./dictionary";
import type { MatchedTag, TagEntry } from "./types";

/**
 * LLM（Gemini）による意味ベースのタグ抽出。
 * 文字列照合では拾えない言い換え表現や、否定（「笑っていない」）を扱える。
 * 抽出結果はタグ辞書と照合し、辞書にあるタグは辞書側の定義
 * （日本語訳・カテゴリ・優先度）を正とする。
 *
 * 必要な環境変数: GEMINI_API_KEY（.env.local）
 * モデルの変更: GEMINI_MODEL（既定: gemini-2.5-flash）
 */

const TIMEOUT_MS = 20000;
const MAX_TAGS = 40;

const norm = (t: string) => t.toLowerCase().replace(/[_\s]+/g, " ").trim();

// 辞書の逆引きインデックス（タグ名 + 英語エイリアス → エントリ）
let index: Map<string, TagEntry> | null = null;
function dictIndex(): Map<string, TagEntry> {
  if (index) return index;
  index = new Map();
  for (const e of allEntries) {
    if (!index.has(norm(e.tag))) index.set(norm(e.tag), e);
  }
  for (const e of allEntries) {
    for (const a of e.aliases) {
      if (/^[\x20-\x7e]+$/.test(a) && !index.has(norm(a))) index.set(norm(a), e);
    }
  }
  return index;
}

export function llmExtractorAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function llmExtractorName(): string {
  return `Gemini (${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"})`;
}

const VALID_CATEGORIES = CATEGORY_ORDER.filter((c) => c !== "quality");

function buildPrompt(texts: { ja?: string; en?: string }): string {
  return `You are a Danbooru tag extraction engine for Stable Diffusion prompts.
Extract Danbooru-style tags describing the VISUAL content of the scene below.

Rules:
- Output a JSON array of objects: {"tag": "...", "category": "..."}
- Tags: lowercase, underscores instead of spaces, standard Danbooru vocabulary (e.g. 1girl, blonde_hair, looking_at_viewer)
- Categories (choose the best fit): ${VALID_CATEGORIES.join(", ")}
- Cover when present: subject count, hair color/style, eyes, body features, clothing, accessories, held items, expression, gaze direction, pose/action, camera angle/composition, background/scenery/time, lighting, art style
- Do NOT include: quality tags (masterpiece, best quality, highres), artist names, character/copyright names unless explicitly written
- Respect negation: if the text says something is absent (e.g. "not smiling", "no hat"), do NOT output that tag
- Prefer the most common canonical Danbooru tag form: "sunset" not "sunset_lighting", "expressionless" not "straight_face", "smile" not "smiling_face"
- Only tags clearly supported by the text. No speculation beyond it.
- Typically 8-25 tags.

${texts.ja ? `Text (Japanese):\n${texts.ja}\n` : ""}
${texts.en ? `Text (English):\n${texts.en}\n` : ""}`;
}

interface LlmTag {
  tag?: unknown;
  category?: unknown;
}

async function callGemini(prompt: string): Promise<LlmTag[]> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini API error: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") throw new Error("Gemini API: unexpected response shape");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Gemini API: response is not a JSON array");
    return parsed as LlmTag[];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * LLMでタグ候補を抽出し、辞書と照合して MatchedTag[] を返す。
 * - 辞書にあるタグ → 辞書エントリを採用（カテゴリ・日本語訳・優先度は辞書が正）
 * - 辞書にないタグ → LLMのカテゴリ判定を採用した新規エントリとして返す
 */
export async function extractWithLLM(texts: {
  ja?: string;
  en?: string;
}): Promise<MatchedTag[]> {
  const raw = await callGemini(buildPrompt(texts));
  const idx = dictIndex();
  const out = new Map<string, MatchedTag>();

  for (const item of raw.slice(0, MAX_TAGS)) {
    if (typeof item?.tag !== "string") continue;
    const tag = item.tag
      .toLowerCase()
      .replace(/[()<>:{}[\]"']/g, "")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!tag || !/^[\x20-\x7e]+$/.test(tag)) continue;

    const entry = idx.get(norm(tag));
    if (entry) {
      if (entry.category === "negative") continue;
      if (!out.has(entry.tag)) out.set(entry.tag, { ...entry, matchedText: "AI抽出" });
      continue;
    }

    // 辞書にない場合は LLM のカテゴリ判定を採用（品質タグは自動付与に任せる）
    const category =
      typeof item.category === "string" && VALID_CATEGORIES.includes(item.category)
        ? item.category
        : "other";
    if (!out.has(tag)) {
      out.set(tag, {
        tag,
        ja: "",
        category,
        aliases: [],
        priority: 10,
        matchedText: "AI提案（辞書外）",
      });
    }
  }
  return [...out.values()];
}
