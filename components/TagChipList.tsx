"use client";

import { CATEGORY_LABELS, PROMPT_LINES, promptLineIndex } from "@/lib/categories";
import type { MatchedTag } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  quality: "border-amber-500/40 text-amber-300",
  style: "border-fuchsia-500/40 text-fuchsia-300",
  subject: "border-sky-500/40 text-sky-300",
  hair: "border-yellow-500/40 text-yellow-200",
  hair_style: "border-yellow-600/40 text-yellow-300",
  eyes: "border-emerald-500/40 text-emerald-300",
  body: "border-teal-500/40 text-teal-300",
  clothing: "border-pink-500/40 text-pink-300",
  expression: "border-orange-500/40 text-orange-300",
  gaze: "border-cyan-500/40 text-cyan-300",
  pose: "border-violet-500/40 text-violet-300",
  camera: "border-indigo-500/40 text-indigo-300",
  background: "border-green-500/40 text-green-300",
  lighting: "border-rose-400/40 text-rose-300",
  other: "border-gray-500/40 text-gray-300",
};

export default function TagChipList({ tags }: { tags: MatchedTag[] }) {
  // プロンプトの行構成と同じグループで表示する
  const groups = PROMPT_LINES.map((line, i) => ({
    line,
    items: tags.filter((t) => promptLineIndex(t.tag, t.category) === i),
  })).filter((g) => g.items.length > 0);

  let lineNo = 0;
  return (
    <div className="space-y-3">
      {groups.map(({ line, items }) => {
        lineNo += 1;
        return (
          <div key={line.name}>
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-gray-500">
              {lineNo}行目: {line.name}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((t) => (
                <span
                  key={t.tag}
                  title={`${t.ja ? `${t.ja} / ` : ""}カテゴリ: ${CATEGORY_LABELS[t.category] ?? t.category} / マッチ: ${t.matchedText}`}
                  className={`cursor-default rounded-full border bg-[#1a1d24] px-2.5 py-1 text-xs ${
                    CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.other
                  }`}
                >
                  {t.tag}
                  {t.ja && <span className="ml-1.5 text-[10px] text-gray-500">{t.ja}</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
