/**
 * 画像（イラスト）→ 日本語説明文の生成（Vision LLM）。
 * 生成した説明文は入力欄に反映され、既存の翻訳・タグ変換フローに流せる。
 *
 * プロバイダの選択:
 * - OPENAI_API_KEY が設定されていれば OpenAI（既定: gpt-4o-mini、OPENAI_MODEL で変更可）
 * - なければ GEMINI_API_KEY で Gemini（既定: gemini-2.5-flash、GEMINI_MODEL で変更可）
 * - どちらも未設定なら利用不可（describeAvailable() が false）
 */

import { openAIFailureReason } from "./llmCommon";

const TIMEOUT_MS = 30000;

const PROMPT = `このイラスト（画像）を、画像生成AI（Stable Diffusion）のプロンプト作成に使うための日本語の説明文に変換してください。

ルール:
- 見えている視覚要素だけを客観的に描写する（推測や物語は書かない）
- 含める要素（画像に存在する場合）: 人物の数と性別、髪の色・髪型、目の色、体の特徴、服装、装飾品、持ち物、表情、視線、ポーズ・動作、構図・カメラアングル、背景・場所・時間帯、光の当たり方、画風
- 1〜3文程度の自然な日本語。箇条書きにしない
- 説明文だけを出力し、前置きや補足は書かない`;

export function describeAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY || !!process.env.GEMINI_API_KEY;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(base64: string, mimeType: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI API error: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenAI API: unexpected response shape");
  }
  return text.trim();
}

async function callGemini(base64: string, mimeType: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API error: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini API: unexpected response shape");
  }
  return text.trim();
}

/**
 * 画像（base64）を日本語の説明文に変換する。
 * OpenAIが失敗した場合（残高不足など）、Geminiキーがあれば自動でフォールバックする。
 */
export async function describeImage(
  base64: string,
  mimeType: string,
): Promise<{ description: string; provider: string }> {
  const geminiName = `Gemini (${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"})`;

  if (process.env.OPENAI_API_KEY) {
    try {
      const description = await callOpenAI(base64, mimeType);
      return {
        description,
        provider: `OpenAI (${process.env.OPENAI_MODEL ?? "gpt-4o-mini"})`,
      };
    } catch (err) {
      const reason = openAIFailureReason(err);
      if (!process.env.GEMINI_API_KEY) throw new Error(reason);
      console.error("OpenAI describe failed, falling back to Gemini:", err);
      const description = await callGemini(base64, mimeType);
      return { description, provider: `${geminiName} ※${reason}のためフォールバック` };
    }
  }

  const description = await callGemini(base64, mimeType);
  return { description, provider: geminiName };
}
