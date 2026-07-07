import { allEntries as entries } from "./dictionary";
import type { Lang } from "./types";

const isAscii = (s: string) => /^[\x20-\x7e]+$/.test(s);

interface Pair {
  from: string;
  to: string;
}

const pairCache: Partial<Record<Lang, Pair[]>> = {};

function buildPairs(from: Lang): Pair[] {
  const cached = pairCache[from];
  if (cached) return cached;
  const pairs: Pair[] = [];
  for (const e of entries) {
    if (e.category === "negative" || e.category === "quality") continue;
    const en = e.tag.replace(/_/g, " ");
    if (from === "ja") {
      const jaWords = [e.ja, ...e.aliases.filter((a) => !isAscii(a))];
      for (const w of jaWords) pairs.push({ from: w, to: en });
    } else {
      const enWords = [en, ...e.aliases.filter(isAscii)];
      for (const w of enWords) pairs.push({ from: w, to: e.ja });
    }
  }
  // 長い語から置換して部分一致の誤置換を防ぐ
  pairs.sort((a, b) => b.from.length - a.from.length);
  pairCache[from] = pairs;
  return pairs;
}

/**
 * ネットワーク不要の辞書ベース簡易翻訳。
 * タグ辞書の語彙を対訳として置換するだけの粗い実装で、
 * 外部翻訳APIが使えない環境での最終フォールバック。
 */
export function mockTranslate(text: string, from: Lang, to: Lang): string {
  void to;
  let result = text;
  for (const { from: src, to: dst } of buildPairs(from)) {
    if (from === "en") {
      const esc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      result = result.replace(new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "gi"), dst);
    } else {
      result = result.split(src).join(` ${dst} `);
    }
  }
  return result.replace(/\s+/g, " ").trim();
}
