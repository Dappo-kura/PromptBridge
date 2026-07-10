/**
 * AI（Vision/LLM）APIの接続状態チェック。
 * 画面起動時に呼ばれ、APIキーが実際に有効かを確認する。
 * モデル一覧の取得（生成を伴わない）で検証するため、無料枠・課金は消費しない。
 */

import type { AiStatus } from "./types";

const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function checkOpenAI(): Promise<AiStatus> {
  const provider = `OpenAI (${process.env.OPENAI_MODEL ?? "gpt-4o-mini"})`;
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    if (res.ok) return { configured: true, ok: true, provider, error: null };
    const error =
      res.status === 401
        ? "OPENAI_API_KEY が無効です。キーを確認してください"
        : `OpenAI API応答エラー (HTTP ${res.status})`;
    return { configured: true, ok: false, provider, error };
  } catch {
    return {
      configured: true,
      ok: false,
      provider,
      error: "OpenAI APIに接続できません（ネットワークを確認してください）",
    };
  }
}

async function checkGemini(): Promise<AiStatus> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const provider = `Gemini (${model})`;
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}`,
      { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! } },
    );
    if (res.ok) return { configured: true, ok: true, provider, error: null };
    const error =
      res.status === 400 || res.status === 401 || res.status === 403
        ? "GEMINI_API_KEY が無効です。キーを確認してください"
        : res.status === 404
          ? `モデル「${model}」が見つかりません（GEMINI_MODEL を確認してください）`
          : `Gemini API応答エラー (HTTP ${res.status})`;
    return { configured: true, ok: false, provider, error };
  } catch {
    return {
      configured: true,
      ok: false,
      provider,
      error: "Gemini APIに接続できません（ネットワークを確認してください）",
    };
  }
}

/** 設定されているAIプロバイダの接続状態を返す（OpenAI優先、次にGemini） */
export async function checkAiStatus(): Promise<AiStatus> {
  if (process.env.OPENAI_API_KEY) return checkOpenAI();
  if (process.env.GEMINI_API_KEY) return checkGemini();
  return {
    configured: false,
    ok: false,
    provider: null,
    error: null,
  };
}
