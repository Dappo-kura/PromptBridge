/**
 * Danbooru 公式タグAPI (https://danbooru.donmai.us/tags.json) から
 * 使用頻度上位の general タグを取得し、data/tag-dictionary.danbooru.json を生成する。
 *
 * 使い方:
 *   npm run import-danbooru          # 上位3000タグ（1000件×3ページ）
 *   npm run import-danbooru -- 5     # ページ数を指定（1ページ=1000タグ）
 *
 * 既存辞書（手動 base / prompt-all-in-one 由来 generated）に存在する
 * タグ・エイリアスと重複するものはスキップされます。
 * Danbooru には日本語訳がないため ja は空。英語照合のみで使われます。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const basePath = path.join(root, "data", "tag-dictionary.json");
const generatedPath = path.join(root, "data", "tag-dictionary.generated.json");
const outPath = path.join(root, "data", "tag-dictionary.danbooru.json");

const PAGES = Math.max(1, Math.min(10, Number(process.argv[2]) || 3));
const API = "https://danbooru.donmai.us/tags.json";
const UA = "PromptBridge/0.1 (tag dictionary import; personal tool)";

const norm = (t) => String(t).toLowerCase().replace(/_/g, " ").trim();

// メタ情報系（絵の内容を表さない）タグは除外
const NOISE = /commentary|translat|request|bad_id|bad_.*_id|artist_name|web_address|username|has_.*_revision|paid_reward|spoiler|duplicate|md5_mismatch|resized|upscaled|third-party|official_art|scan\b/;

// 裸の一般名詞（どんな文にも現れてノイズになる）は取り込まない
const GENERIC_SKIP = new Set([
  "head", "face", "body", "skin", "hair", "eye", "eyes", "mouth", "nose",
  "ear", "ears", "hand", "hands", "leg", "legs", "arm", "arms", "foot",
  "feet", "finger", "fingers", "neck", "chest", "back", "human", "person",
  "people", "character", "color", "colors", "light", "lights", "dark",
  "young", "old", "new", "big", "small", "long", "short", "wide", "high",
  "low", "front", "side", "top", "bottom", "left", "right", "center",
]);

// ---- カテゴリ推定（タグ名のトークンから本ツールのカテゴリを推定） ----
const LEX = {
  subject: new Set(["1girl", "1boy", "2girls", "2boys", "3girls", "3boys", "4girls", "4boys", "multiple_girls", "multiple_boys", "1other", "solo", "solo_focus", "6+girls", "6+boys", "no_humans", "couple", "siblings"]),
  camera: new Set(["upper_body", "full_body", "lower_body", "portrait", "close-up", "cowboy_shot", "dutch_angle", "pov", "wide_shot", "depth_of_field", "blurry", "blurry_background", "blurry_foreground", "foreshortening", "out_of_frame", "face_focus", "feet_out_of_frame"]),
  lightingWords: new Set(["sunlight", "backlighting", "lens_flare", "moonlight", "spotlight", "glowing", "glow", "shade", "shadow", "light_rays", "sunbeam", "dappled_sunlight", "bloom"]),
  clothingWords: new Set(["shirt", "skirt", "dress", "uniform", "serafuku", "jacket", "coat", "pants", "shorts", "bikini", "swimsuit", "panties", "underwear", "bra", "thighhighs", "pantyhose", "socks", "kneehighs", "legwear", "gloves", "hat", "cap", "ribbon", "bow", "boots", "shoes", "sandals", "footwear", "headwear", "sleeves", "sleeveless", "necktie", "scarf", "collar", "choker", "jewelry", "earrings", "necklace", "bracelet", "glasses", "eyewear", "mask", "hood", "hoodie", "apron", "vest", "sweater", "kimono", "obi", "sash", "belt", "armor", "cape", "frills", "frilled", "lace", "leotard", "bowtie", "buttons", "zipper", "pocket", "clothes", "clothing", "outfit", "costume", "bodysuit", "headband", "hairband", "hairclip", "hair_ornament", "crown", "helmet", "cardigan", "blazer", "camisole", "tank_top", "t-shirt", "miniskirt", "capelet", "garter", "suspenders", "wristband", "armband", "hakama", "haori", "sarashi", "fundoshi", "loincloth", "bandeau", "babydoll", "negligee", "veil", "tiara", "goggles", "monocle", "piercing"]),
  bodyWords: new Set(["breasts", "tail", "ears", "ear", "horn", "horns", "wings", "wing", "fang", "fangs", "teeth", "tongue", "skin", "navel", "midriff", "thighs", "thigh", "legs", "barefoot", "feet", "foot", "toenails", "fingernails", "nail", "halo", "mole", "scar", "muscle", "muscular", "abs", "cleavage", "collarbone", "armpits", "armpit", "stomach", "hips", "waist", "shoulders", "back", "spine", "freckles", "tan", "tanlines", "pale", "dark-skinned", "flat_chest", "petite", "curvy", "plump", "slim", "tall", "short", "chibi", "ahoge", "sidelocks", "eyelashes", "eyebrows", "pupils", "sclera", "body"]),
  expressionWords: new Set(["smile", "smiling", "grin", "frown", "crying", "tears", "blush", "blushing", "expression", "angry", "happy", "sad", "surprised", "embarrassed", "scared", "nervous", "annoyed", "smug", "pout", "wink", "laughing", "screaming", "shouting", "sweatdrop", "smirk", "expressionless", "drunk", "sleepy", "bored", "confused", "serious", "shy", "worried", "jitome", "tsurime", "tareme"]),
  poseWords: new Set(["sitting", "standing", "lying", "kneeling", "squatting", "leaning", "walking", "running", "jumping", "flying", "floating", "stretching", "bent_over", "crossed_arms", "crossed_legs", "spread_legs", "outstretched", "reaching", "pose", "posing", "arm_up", "arms_up", "arm_support", "hand_up", "hands_up", "hand_on", "hands_on", "arms_behind", "hand_in", "hands_in", "head_rest", "hugging", "carrying", "straddling", "wariza", "seiza", "indian_style", "fetal_position", "on_back", "on_side", "on_stomach", "kick", "kicking", "punch", "punching", "fighting_stance", "salute", "waving", "pointing", "clenched", "fist", "peace_sign", "v_sign", "shushing", "facepalm", "gesture"]),
  backgroundWords: new Set(["sky", "cloud", "clouds", "cloudy", "tree", "trees", "water", "ocean", "sea", "beach", "day", "night", "sunset", "sunrise", "dusk", "dawn", "evening", "indoors", "outdoors", "moon", "star", "stars", "starry", "rain", "raining", "snow", "snowing", "wind", "grass", "field", "flower_field", "forest", "mountain", "city", "cityscape", "street", "road", "building", "room", "bedroom", "bathroom", "classroom", "kitchen", "office", "pool", "poolside", "onsen", "shrine", "temple", "castle", "ruins", "space", "underwater", "horizon", "scenery", "landscape", "wall", "window", "door", "curtains", "bed", "chair", "table", "desk", "couch", "sofa", "sand", "rock", "cliff", "waterfall", "river", "lake", "pond", "bridge", "railing", "fence", "path", "alley", "rooftop", "balcony", "stairs", "vegetation", "bush", "autumn", "winter", "spring", "summer", "season"]),
};

function categorize(tag) {
  const t = tag.toLowerCase();
  const tokens = t.split(/[_-]/);
  const hasToken = (set) => tokens.some((w) => set.has(w)) || set.has(t);

  if (LEX.subject.has(t)) return "subject";
  if (t.includes("background")) return "background";
  if (t.endsWith("hair") || t.startsWith("hair_") || tokens.includes("braid") || tokens.includes("ponytail") || tokens.includes("twintails") || tokens.includes("bangs")) return "hair_style";
  if (t.endsWith("eyes") || t.endsWith("eye")) return "eyes";
  if (t.startsWith("looking_") || t.includes("gaze") || t === "eye_contact" || t.startsWith("staring")) return "gaze";
  if (t.startsWith("holding")) return "pose";
  if (LEX.camera.has(t) || t.startsWith("from_")) return "camera";
  if (hasToken(LEX.lightingWords)) return "lighting";
  if (hasToken(LEX.expressionWords)) return "expression";
  if (hasToken(LEX.clothingWords)) return "clothing";
  if (hasToken(LEX.poseWords)) return "pose";
  if (hasToken(LEX.bodyWords)) return "body";
  if (hasToken(LEX.backgroundWords)) return "background";
  return "other";
}

// ---- 既存辞書の読み込み（重複除外用） ----
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const generated = fs.existsSync(generatedPath)
  ? JSON.parse(fs.readFileSync(generatedPath, "utf8"))
  : [];

const existingKeys = new Set();
for (const e of [...base, ...generated]) {
  existingKeys.add(norm(e.tag));
  for (const a of e.aliases) if (/^[\x20-\x7e]+$/.test(a)) existingKeys.add(norm(a));
}

// ---- API取得 ----
const fetched = [];
for (let page = 1; page <= PAGES; page++) {
  const url = `${API}?search[category]=0&search[hide_empty]=true&search[order]=count&limit=1000&page=${page}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.error(`APIエラー (page ${page}): HTTP ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  fetched.push(...data);
  console.log(`page ${page}: ${data.length} 件取得`);
  await new Promise((r) => setTimeout(r, 500)); // レート制限への配慮
}

// ---- 変換 ----
const seen = new Set();
const entries = [];
const stats = {};
let dup = 0;
let noise = 0;

for (const t of fetched) {
  const tag = String(t.name).trim();
  const key = norm(tag);
  if (!tag || !/^[\x20-\x7e]+$/.test(tag)) continue;
  if (NOISE.test(key)) { noise++; continue; }
  if (GENERIC_SKIP.has(key)) { noise++; continue; }
  if (seen.has(key) || existingKeys.has(key)) { dup++; continue; }
  seen.add(key);

  const category = categorize(tag);
  // 使用頻度を priority に反映（手動100/生成50より低く、辞書内の序列を守る）
  const priority = t.post_count >= 500000 ? 40 : t.post_count >= 100000 ? 35 : t.post_count >= 20000 ? 30 : 20;

  entries.push({ tag, ja: "", category, aliases: [], priority });
  stats[category] = (stats[category] ?? 0) + 1;
}

entries.sort((a, b) =>
  a.category === b.category ? b.priority - a.priority || a.tag.localeCompare(b.tag) : a.category.localeCompare(b.category),
);

fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n", "utf8");

console.log(`\n生成完了: ${outPath}`);
console.log(`  取り込み: ${entries.length} タグ / 既存と重複: ${dup} / メタ情報系を除外: ${noise}`);
for (const [cat, n] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${n}`);
}
