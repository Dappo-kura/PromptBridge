import type { Lang } from "./types";
import { mockTranslate } from "./mockTranslate";

/**
 * 翻訳プロバイダのインターフェース。
 * 将来 OpenAI / Claude などの LLM 翻訳を追加する場合は
 * この Translator を実装して PROVIDERS に追加するだけでよい。
 */
export interface Translator {
  name: string;
  /** このプロバイダが現在利用可能か（APIキーの有無など） */
  available(): boolean;
  translate(text: string, from: Lang, to: Lang): Promise<string>;
}

export interface TranslateResult {
  text: string;
  provider: string;
}

const FETCH_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** DeepL API Free/Pro（DEEPL_API_KEY が設定されている場合のみ有効） */
const deeplTranslator: Translator = {
  name: "DeepL API",
  available: () => !!process.env.DEEPL_API_KEY,
  async translate(text, from, to) {
    const key = process.env.DEEPL_API_KEY!;
    const endpoint = key.endsWith(":fx")
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";
    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        source_lang: from.toUpperCase(),
        target_lang: to.toUpperCase(),
      }),
    });
    if (!res.ok) throw new Error(`DeepL API error: ${res.status}`);
    const data = await res.json();
    const out = data?.translations?.[0]?.text;
    if (typeof out !== "string") throw new Error("DeepL API: unexpected response");
    return out;
  },
};

/** Google翻訳の無料エンドポイント（キー不要・非公式のためフォールバック前提） */
const googleFreeTranslator: Translator = {
  name: "Google翻訳（無料エンドポイント）",
  available: () => true,
  async translate(text, from, to) {
    const url =
      "https://translate.googleapis.com/translate_a/single" +
      `?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Google translate error: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.[0])) throw new Error("Google translate: unexpected response");
    return data[0]
      .map((seg: unknown[]) => (typeof seg?.[0] === "string" ? seg[0] : ""))
      .join("");
  },
};

/** 完全オフラインの辞書ベース簡易翻訳（最終フォールバック / モック） */
const mockTranslator: Translator = {
  name: "簡易辞書翻訳（オフライン）",
  available: () => true,
  async translate(text, from, to) {
    return mockTranslate(text, from, to);
  },
};

function providerChain(): Translator[] {
  const pref = (process.env.TRANSLATE_PROVIDER ?? "auto").toLowerCase();
  switch (pref) {
    case "deepl":
      return [deeplTranslator, mockTranslator];
    case "google":
      return [googleFreeTranslator, mockTranslator];
    case "mock":
      return [mockTranslator];
    default:
      return [deeplTranslator, googleFreeTranslator, mockTranslator];
  }
}

/**
 * テキストを翻訳する。利用可能なプロバイダを順に試し、
 * すべて失敗した場合のみ例外を投げる。
 */
export async function translateText(
  text: string,
  from: Lang,
  to: Lang,
): Promise<TranslateResult> {
  let lastError: unknown = null;
  for (const provider of providerChain()) {
    if (!provider.available()) continue;
    try {
      const result = await provider.translate(text, from, to);
      return { text: result, provider: provider.name };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `翻訳に失敗しました: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
