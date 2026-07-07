import baseJson from "@/data/tag-dictionary.json";
import generatedJson from "@/data/tag-dictionary.generated.json";
import danbooruJson from "@/data/tag-dictionary.danbooru.json";
import type { TagEntry } from "./types";

/**
 * タグ辞書は3層構成（上の層ほど優先）:
 * - tag-dictionary.json           手動管理（豊富なエイリアス・優先度。常に優先）
 * - tag-dictionary.generated.json prompt-all-in-one から自動生成（npm run import-tags）
 * - tag-dictionary.danbooru.json  Danbooru タグAPIから自動生成（npm run import-danbooru）
 *                                 日本語訳なし・英語照合のみ
 */
export const baseEntries = baseJson as TagEntry[];
const generatedEntries = generatedJson as TagEntry[];
const danbooruEntries = danbooruJson as TagEntry[];

const norm = (tag: string) => tag.toLowerCase().replace(/_/g, " ").trim();

/** base優先でマージした全エントリ（配列順=優先順。照合の同点時も先勝ち） */
export const allEntries: TagEntry[] = (() => {
  const seen = new Set<string>();
  const merged: TagEntry[] = [];
  for (const layer of [baseEntries, generatedEntries, danbooruEntries]) {
    for (const e of layer) {
      const key = norm(e.tag);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
  }
  return merged;
})();
