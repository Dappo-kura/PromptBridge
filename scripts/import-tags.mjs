/**
 * prompt-all-in-one 拡張の group_tags/ja_JP.yaml から
 * data/tag-dictionary.generated.json を生成するインポートスクリプト。
 *
 * 使い方:
 *   npm run import-tags
 *   npm run import-tags -- "C:/path/to/ja_JP.yaml"
 *
 * 手動管理の data/tag-dictionary.json (base) が常に優先されます。
 * base に存在するタグ / base のエイリアスと衝突するタグはスキップされます。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const DEFAULT_YAML =
  "C:/StabilityMatrix/Data/Packages/Stable Diffusion WebUI/extensions/prompt-all-in-one-ex/group_tags/ja_JP.yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const yamlPath = process.argv[2] ?? DEFAULT_YAML;
const basePath = path.join(root, "data", "tag-dictionary.json");
const outPath = path.join(root, "data", "tag-dictionary.generated.json");

// ---- カテゴリマッピング -------------------------------------------------
// 二次分類名 → 本ツールのカテゴリ（優先）。なければ一次分類名で判定。
const GROUP_MAP = {
  キャラクター: "subject",
  身分: "subject",
  年齢: "subject",
  二次元キャラクター: "other",
  髪の毛: "hair",
  目: "eyes",
  瞳孔: "eyes",
  眉毛: "eyes",
  皮膚: "body",
  体型: "body",
  顔の形: "body",
  顔: "body",
  耳: "body",
  鼻: "body",
  口: "body",
  歯: "body",
  舌: "body",
  爪: "body",
  肩: "body",
  胸部: "body",
  腰: "body",
  腹部: "body",
  翼: "body",
  笑: "expression",
  泣き: "expression",
  不幸: "expression",
  軽蔑: "expression",
  怒り: "expression",
  その他表情: "expression",
  基本動作: "pose",
  手の動き: "pose",
  "手の動き（何かを持っている）": "pose",
  "手の動き（場所に置いている）": "pose",
  "手の動き（何かをつかんでいる）": "pose",
  脚の動き: "pose",
  その他の動作: "pose",
  画質: "quality",
  芸術スタイル: "style",
  芸術の種類: "style",
  芸術派: "style",
  アーティストのスタイル: "style",
  スケッチ: "style",
  ペン: "style",
  リアル: "style",
  色: "style",
  照明: "lighting",
  背景: "background",
  レンズ: "camera",
  クローズアップ: "camera",
  他の構図: "camera",
  カメラの角度: "camera",
  効果: "camera",
  主人公の動作: "gaze",
};

const TOP_MAP = {
  人物: "subject",
  衣服や装飾品: "clothing",
  表情動作: "expression",
  画面: "style",
  環境: "background",
  シーン: "background",
  アイテム: "other",
  レンズ: "camera",
  漢服: "clothing",
};

// ネガティブ用 Embeddings などは本ツールでは使わないためスキップ
const SKIP_TOP = new Set(["ネガティブなプロンプト"]);

// ---- ユーティリティ ------------------------------------------------------
const isAscii = (s) => /^[\x20-\x7e]+$/.test(s);
const norm = (t) => t.toLowerCase().replace(/_/g, " ").trim();

/** 日本語訳から照合用エイリアスを作る（記号除去・分割・2文字以上のみ） */
function jaAliases(ja) {
  return ja
    .split(/[\/／・,、]/)
    .map((s) => s.replace(/[↖↗↘↙←→↑↓♪☆★〜~～!！?？。.\s]+$/g, "").trim())
    .filter((s) => s.length >= 2 && !isAscii(s));
}

// ---- メイン ---------------------------------------------------------------
if (!fs.existsSync(yamlPath)) {
  console.error(`YAMLファイルが見つかりません: ${yamlPath}`);
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const baseTagKeys = new Set(base.map((e) => norm(e.tag)));
const baseAliasKeys = new Set();
for (const e of base) {
  for (const a of e.aliases) baseAliasKeys.add(isAscii(a) ? norm(a) : a);
  if (e.ja) baseAliasKeys.add(e.ja);
}

const doc = parse(fs.readFileSync(yamlPath, "utf8"), { uniqueKeys: false });

const seen = new Set();
const entries = [];
const stats = {};
let skipped = 0;

for (const top of doc ?? []) {
  if (!top?.name || SKIP_TOP.has(top.name)) continue;
  for (const group of top.groups ?? []) {
    const category = GROUP_MAP[group?.name] ?? TOP_MAP[top.name] ?? "other";
    const tags = group?.tags ?? {};
    for (const [rawTag, rawJa] of Object.entries(tags)) {
      const tag = String(rawTag).trim();
      const ja = String(rawJa ?? "").trim();
      const key = norm(tag);
      // ASCIIタグのみ / base優先 / baseのエイリアスと衝突するタグは除外
      if (!tag || !isAscii(tag) || !ja) { skipped++; continue; }
      if (seen.has(key) || baseTagKeys.has(key) || baseAliasKeys.has(key)) { skipped++; continue; }
      seen.add(key);

      // baseの日本語エイリアスと重複する照合語は除外（baseの優先を保証）
      const aliases = jaAliases(ja).filter((a) => !baseAliasKeys.has(a));

      entries.push({ tag, ja, category, aliases, priority: 50 });
      stats[category] = (stats[category] ?? 0) + 1;
    }
  }
}

entries.sort((a, b) =>
  a.category === b.category ? a.tag.localeCompare(b.tag) : a.category.localeCompare(b.category),
);

fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n", "utf8");

console.log(`生成完了: ${outPath}`);
console.log(`  取り込み: ${entries.length} タグ / スキップ: ${skipped}（重複・base優先・非ASCII）`);
for (const [cat, n] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${n}`);
}
