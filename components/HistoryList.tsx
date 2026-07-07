"use client";

import { MODE_LABELS } from "@/lib/types";
import type { HistoryItem } from "@/lib/types";

interface Props {
  items: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClear: () => void;
}

export default function HistoryList({ items, onSelect, onClear }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-600">履歴はまだありません</p>;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">直近 {items.length} 件</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-500 underline-offset-2 hover:text-red-400 hover:underline"
        >
          履歴を削除
        </button>
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="w-full rounded-md border border-panelBorder bg-[#1a1d24] px-2.5 py-1.5 text-left transition hover:border-accent"
            >
              <div className="truncate text-xs text-gray-300">{item.sourceText}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-600">
                <span>{MODE_LABELS[item.mode]}</span>
                <span>{new Date(item.createdAt).toLocaleString("ja-JP")}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
