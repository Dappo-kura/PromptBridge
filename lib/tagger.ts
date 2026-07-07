import { CATEGORY_ORDER, PROMPT_LINES, promptLineIndex } from "./categories";
import { allEntries as entries, baseEntries } from "./dictionary";
import type { Lang, MatchedTag, TagEntry } from "./types";

export { CATEGORY_LABELS, CATEGORY_ORDER, PROMPT_LINES } from "./categories";

/** 常に自動付与する品質タグ（辞書のqualityカテゴリ全体ではなくこの2つのみ） */
const AUTO_QUALITY_TAGS = ["masterpiece", "best quality"];

const isAscii = (s: string) => /^[\x20-\x7e]+$/.test(s);

interface Candidate {
  entry: TagEntry;
  alias: string;
}

/** 言語ごとの照合候補（エイリアス）一覧。長い語を優先するため文字数降順。 */
const candidateCache: Partial<Record<Lang, Candidate[]>> = {};

function collectCandidates(lang: Lang): Candidate[] {
  const cached = candidateCache[lang];
  if (cached) return cached;

  const out: Candidate[] = [];
  for (const entry of entries) {
    if (entry.category === "negative") continue;
    const aliases = new Set<string>();
    if (lang === "en") {
      aliases.add(entry.tag.replace(/_/g, " ").toLowerCase());
      for (const a of entry.aliases) if (isAscii(a)) aliases.add(a.toLowerCase());
    } else {
      // 1文字の日本語（例:「山」）は誤マッチしやすいため、
      // 手動辞書で明示的に aliases に入っている場合のみ照合対象になる
      if (entry.ja && entry.ja.length >= 2 && !isAscii(entry.ja)) aliases.add(entry.ja);
      for (const a of entry.aliases) if (!isAscii(a)) aliases.add(a);
    }
    for (const alias of aliases) out.push({ entry, alias });
  }
  // 長さ降順。同点は辞書順（base が先）を保つ安定ソート
  out.sort((a, b) => b.alias.length - a.alias.length);
  candidateCache[lang] = out;
  return out;
}

/**
 * 1つのテキストから辞書エイリアスにヒットするタグを抽出する。
 * 長いエイリアスからマッチ済み範囲を消費していくことで、
 * 「白いワンピース」に white_dress と dress が二重ヒットするのを防ぐ。
 */
function findMatches(text: string, lang: Lang): MatchedTag[] {
  if (!text) return [];
  const haystack = lang === "en" ? text.toLowerCase() : text;
  const usedRanges: Array<[number, number]> = [];
  const found = new Map<string, MatchedTag>();

  for (const { entry, alias } of collectCandidates(lang)) {
    const occurrences: Array<[number, number]> = [];
    if (lang === "en") {
      const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const re = new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(haystack)) !== null) {
        occurrences.push([m.index, m.index + m[0].length]);
      }
    } else {
      let idx = haystack.indexOf(alias);
      while (idx !== -1) {
        occurrences.push([idx, idx + alias.length]);
        idx = haystack.indexOf(alias, idx + 1);
      }
    }
    for (const [start, end] of occurrences) {
      const overlaps = usedRanges.some(([s, e]) => start < e && end > s);
      if (overlaps) continue;
      usedRanges.push([start, end]);
      if (!found.has(entry.tag)) {
        found.set(entry.tag, { ...entry, matchedText: text.slice(start, end) });
      }
    }
  }
  return [...found.values()];
}

/**
 * 意味要素抽出: 原文と翻訳文の両方からタグ候補となる表現を抽出する。
 * 将来 LLM に置き換える場合はこの関数を差し替える。
 */
export function extractSemanticElements(texts: {
  ja?: string;
  en?: string;
}): MatchedTag[] {
  const merged = new Map<string, MatchedTag>();
  if (texts.ja) for (const t of findMatches(texts.ja, "ja")) merged.set(t.tag, t);
  if (texts.en) {
    for (const t of findMatches(texts.en, "en")) {
      if (!merged.has(t.tag)) merged.set(t.tag, t);
    }
  }
  return [...merged.values()];
}

/**
 * 抽出した意味要素を Danbooru タグ集合へ変換する。
 * 品質タグの自動付与と、単独被写体への solo 自動付与を行う。
 */
export function convertToDanbooruTags(elements: MatchedTag[]): MatchedTag[] {
  const tags = [...elements];
  const has = (tag: string) => tags.some((t) => t.tag === tag);

  // 定番の品質タグのみ常に自動付与（辞書のqualityカテゴリ全体は付与しない）
  for (const name of AUTO_QUALITY_TAGS) {
    const q = baseEntries.find((e) => e.tag === name);
    if (q && !has(q.tag)) tags.push({ ...q, matchedText: "自動付与" });
  }

  // 被写体が1人だけなら solo を補完（Danbooru の慣習に合わせる）
  const singles = ["1girl", "1boy"].filter(has).length;
  const multiples = ["2girls", "2boys"].some(has);
  if (singles === 1 && !multiples && !has("solo")) {
    const solo = baseEntries.find((e) => e.tag === "solo");
    if (solo) tags.push({ ...solo, matchedText: "自動付与" });
  }
  return tags;
}

/** 排他関係にあるタグの整理: キー側のタグがあれば値側のタグを除去する */
const EXCLUSIONS: Record<string, string[]> = {
  "2girls": ["1girl", "solo"],
  "2boys": ["1boy", "solo"],
  "3girls": ["1girl", "2girls", "solo"],
  "3boys": ["1boy", "2boys", "solo"],
};

/** 重複除去と排他タグの整理 */
export function normalizeTags(tags: MatchedTag[]): MatchedTag[] {
  const map = new Map<string, MatchedTag>();
  for (const t of tags) if (!map.has(t.tag)) map.set(t.tag, t);
  for (const [present, excluded] of Object.entries(EXCLUSIONS)) {
    if (map.has(present)) for (const e of excluded) map.delete(e);
  }

  // より具体的なタグに単語単位で包含される汎用タグを除去
  // 例: white_dress があれば dress を落とす（LLM抽出で両方出ることがある）
  // ただし包含する側が辞書外のAI提案タグ(priority 10)の場合は、
  // 辞書に実在する汎用タグを優先して残す
  const words = (tag: string) => tag.toLowerCase().split(/[_\s]+/).filter(Boolean);
  const list = [...map.values()];
  for (const a of list) {
    const wa = words(a.tag);
    const isSubsumed = list.some((b) => {
      if (a.tag === b.tag) return false;
      if (b.priority <= 10 && a.priority > 10) return false;
      const wb = words(b.tag);
      if (wb.length <= wa.length) return false;
      // a の単語列が b の単語列に連続部分列として含まれるか
      return wb.some((_, i) => wa.every((w, j) => wb[i + j] === w));
    });
    if (isSubsumed && a.category !== "quality") map.delete(a.tag);
  }
  return [...map.values()];
}

/** 行番号 → カテゴリ順 → priority 降順 → タグ名でソート */
export function sortTagsByCategory(tags: MatchedTag[]): MatchedTag[] {
  const orderIndex = (category: string) => {
    const idx = CATEGORY_ORDER.indexOf(category);
    return idx === -1 ? CATEGORY_ORDER.length : idx;
  };
  return [...tags].sort((a, b) => {
    const l = promptLineIndex(a.tag, a.category) - promptLineIndex(b.tag, b.category);
    if (l !== 0) return l;
    const c = orderIndex(a.category) - orderIndex(b.category);
    if (c !== 0) return c;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.tag.localeCompare(b.tag);
  });
}

/**
 * ソート済みタグから Positive Prompt 文字列を生成。
 * SD運用時のプロンプト構成に合わせ、役割ごとの行ブロックで出力する:
 * 品質・画風 / シチュエーション（ある場合のみ2行目） / キャラデザイン / 服装・持ち物 / カメラ・表情・動作
 */
export function buildPositivePrompt(tags: MatchedTag[]): string {
  const lines: string[][] = PROMPT_LINES.map(() => []);
  for (const t of tags) {
    lines[promptLineIndex(t.tag, t.category)].push(t.tag);
  }
  const rendered = lines.filter((l) => l.length > 0).map((l) => l.join(", "));
  // 行末にカンマを付けて改行（全体として1つのカンマ区切りプロンプトになる）
  return rendered.map((l, i) => (i < rendered.length - 1 ? `${l},` : l)).join("\n");
}

/** 手動辞書の negative カテゴリからデフォルトの Negative Prompt を生成 */
export function buildNegativePrompt(): string {
  return baseEntries
    .filter((e) => e.category === "negative")
    .sort((a, b) => b.priority - a.priority)
    .map((e) => e.tag)
    .join(", ");
}
