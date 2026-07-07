export type Lang = "ja" | "en";

export type Mode = "ja-en-ja" | "en-ja-en" | "ja-en-tags" | "en-ja-tags";

export const MODE_LABELS: Record<Mode, string> = {
  "ja-en-ja": "日本語 → 英語 → 日本語（往復翻訳）",
  "en-ja-en": "英語 → 日本語 → 英語（往復翻訳）",
  "ja-en-tags": "日本語 → 英語 → Danbooruタグ",
  "en-ja-tags": "英語 → 日本語 → Danbooruタグ",
};

export function modeSourceLang(mode: Mode): Lang {
  return mode.startsWith("ja") ? "ja" : "en";
}

export function isTagMode(mode: Mode): boolean {
  return mode.endsWith("tags");
}

/** タグ辞書の1エントリ（data/tag-dictionary.json の形式） */
export interface TagEntry {
  tag: string;
  ja: string;
  category: string;
  aliases: string[];
  priority: number;
}

/** 入力文とのマッチ情報付きタグ */
export interface MatchedTag extends TagEntry {
  /** 入力文・翻訳文のどの表現にヒットしたか（自動付与タグは "自動付与"） */
  matchedText: string;
}

export interface ConvertRequest {
  text: string;
  mode: Mode;
}

export interface ConvertResponse {
  mode: Mode;
  sourceText: string;
  /** 中間翻訳（例: 日→英→日 の英語部分） */
  intermediate: string;
  /** 往復翻訳の最終結果（タグモードでは null） */
  final: string | null;
  /** 使用した翻訳プロバイダ名 */
  provider: string;
  /** タグモードのみ。マッチしたタグ（カテゴリ順ソート済み） */
  tags: MatchedTag[] | null;
  positivePrompt: string | null;
  negativePrompt: string | null;
  /** 品質タグ以外に1つもマッチしなかった場合 true */
  noTagsMatched: boolean;
}

export interface HistoryItem {
  id: string;
  mode: Mode;
  sourceText: string;
  intermediate: string;
  final: string | null;
  positivePrompt: string | null;
  negativePrompt: string | null;
  createdAt: string;
}
