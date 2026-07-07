import baseJson from "@/data/tag-dictionary.json";
import generatedJson from "@/data/tag-dictionary.generated.json";
import type { TagEntry } from "./types";

/**
 * タグ辞書は2層構成:
 * - tag-dictionary.json           手動管理（豊富なエイリアス・優先度。常に優先）
 * - tag-dictionary.generated.json prompt-all-in-one から自動生成（npm run import-tags）
 */
export const baseEntries = baseJson as TagEntry[];
const generatedEntries = generatedJson as TagEntry[];

const norm = (tag: string) => tag.toLowerCase().replace(/_/g, " ").trim();

const baseKeys = new Set(baseEntries.map((e) => norm(e.tag)));

/** base優先でマージした全エントリ（base が先頭に来るため、照合の同点時も base が勝つ） */
export const allEntries: TagEntry[] = [
  ...baseEntries,
  ...generatedEntries.filter((e) => !baseKeys.has(norm(e.tag))),
];
