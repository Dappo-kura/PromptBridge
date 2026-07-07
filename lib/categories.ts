/**
 * カテゴリ定義（クライアント/サーバー共用）。
 * 辞書データ本体を import しないこと — クライアントバンドルに
 * 数千件の辞書 JSON が混入するのを防ぐため独立モジュールにしている。
 */

/**
 * Positive Prompt の行構成。
 * Stable Diffusion 運用時のプロンプト構成に合わせ、行ごとに役割を分ける:
 *   1行目: 品質・画風の指定
 *   2行目: シチュエーション（背景・環境・ライティング。ある場合のみ）
 *   3行目: キャラデザイン（人数・髪・目・体）
 *   4行目: 服装・持ち物
 *   5行目: カメラ・表情・動作
 */
export interface PromptLine {
  name: string;
  categories: string[];
}

export const PROMPT_LINES: PromptLine[] = [
  { name: "品質・画風", categories: ["quality", "style"] },
  { name: "シチュエーション", categories: ["background", "lighting"] },
  { name: "キャラデザイン", categories: ["subject", "hair", "hair_style", "eyes", "body"] },
  { name: "服装・持ち物", categories: ["clothing", "other"] },
  { name: "カメラ・表情・動作", categories: ["camera", "expression", "gaze", "pose"] },
];

/** タグの出力順（行構成をフラット化したカテゴリ順） */
export const CATEGORY_ORDER: string[] = PROMPT_LINES.flatMap((l) => l.categories);

export const CATEGORY_LABELS: Record<string, string> = {
  quality: "品質",
  style: "画風・スタイル",
  subject: "人数・主体",
  hair: "髪色",
  hair_style: "髪型",
  eyes: "目",
  body: "体",
  clothing: "服装",
  expression: "表情",
  gaze: "視線",
  pose: "ポーズ",
  camera: "構図・カメラ",
  background: "背景",
  lighting: "ライティング",
  other: "その他",
  negative: "ネガティブ",
};

/**
 * タグが属する行番号(0始まり)を返す。
 * 例外ルール:
 * - 「〜background」系（white_background 等）はシチュエーションではなく
 *   品質行(1行目)に置く（単色背景は画質指定の一部のため）
 * - 「holding〜」系（holding_sword 等）は動作ではなく服装・持ち物行に置く
 */
export function promptLineIndex(tag: string, category: string): number {
  const normalized = tag.replace(/_/g, " ").toLowerCase();
  if (normalized.endsWith("background")) return 0;
  if (normalized.startsWith("holding")) {
    return PROMPT_LINES.findIndex((l) => l.name === "服装・持ち物");
  }
  const idx = PROMPT_LINES.findIndex((l) => l.categories.includes(category));
  return idx === -1 ? PROMPT_LINES.length - 1 : idx;
}
