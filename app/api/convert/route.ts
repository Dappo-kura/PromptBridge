import { NextResponse } from "next/server";
import { translateText } from "@/lib/translate";
import {
  buildNegativePrompt,
  buildPositivePrompt,
  convertToDanbooruTags,
  extractSemanticElements,
  normalizeTags,
  sortTagsByCategory,
} from "@/lib/tagger";
import { extractWithLLM, llmExtractorAvailable } from "@/lib/llmExtract";
import type { ConvertResponse, Lang, MatchedTag, Mode } from "@/lib/types";

const VALID_MODES: Mode[] = ["ja-en-ja", "en-ja-en", "ja-en-tags", "en-ja-tags"];

export async function POST(req: Request) {
  let body: { text?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const mode = body.mode as Mode;

  if (!text) {
    return NextResponse.json({ error: "入力テキストが空です" }, { status: 400 });
  }
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: "不正な変換モードです" }, { status: 400 });
  }

  const [from, to, third] = mode.split("-") as [Lang, Lang, string | undefined];

  try {
    // 1. 自然文翻訳（原文 → 中間言語）
    const intermediate = await translateText(text, from, to);

    if (third === "tags") {
      // 2. 意味要素抽出 → 3. タグ候補生成 → 4. 正規化 → 5. カテゴリ順ソート
      const jaText = from === "ja" ? text : intermediate.text;
      const enText = from === "en" ? text : intermediate.text;

      // APIキー（OPENAI_API_KEY 優先、なければ GEMINI_API_KEY）があれば LLM で意味抽出（高精度）。
      // 未設定・失敗時は従来の辞書照合にフォールバックする。
      let elements: MatchedTag[];
      let extractor: string;
      if (llmExtractorAvailable()) {
        try {
          const llm = await extractWithLLM({ ja: jaText, en: enText });
          elements = llm.tags;
          extractor = llm.extractor;
        } catch (err) {
          console.error("LLM tag extraction failed, falling back to dictionary:", err);
          elements = extractSemanticElements({ ja: jaText, en: enText });
          extractor = "辞書照合（LLM失敗のためフォールバック）";
        }
      } else {
        elements = extractSemanticElements({ ja: jaText, en: enText });
        extractor = "辞書照合";
      }

      const noTagsMatched = elements.length === 0;
      const tags = sortTagsByCategory(normalizeTags(convertToDanbooruTags(elements)));

      const res: ConvertResponse = {
        mode,
        sourceText: text,
        intermediate: intermediate.text,
        final: null,
        provider: intermediate.provider,
        extractor,
        tags,
        positivePrompt: buildPositivePrompt(tags),
        negativePrompt: buildNegativePrompt(),
        noTagsMatched,
      };
      return NextResponse.json(res);
    }

    // 往復翻訳モード: 中間言語 → 元言語へ再翻訳
    const final = await translateText(intermediate.text, to, from);
    const providers = new Set([intermediate.provider, final.provider]);
    const res: ConvertResponse = {
      mode,
      sourceText: text,
      intermediate: intermediate.text,
      final: final.text,
      provider: [...providers].join(" / "),
      tags: null,
      positivePrompt: null,
      negativePrompt: null,
      noTagsMatched: false,
    };
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "変換処理でエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
