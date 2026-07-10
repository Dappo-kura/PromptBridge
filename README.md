# PromptBridge

日本語・英語の翻訳と、Stable Diffusion 向け Danbooru タグプロンプト変換を行う 3 ペイン Web ツールです。

**🌐 Web版（インストール不要）: https://promptbridge-plum.vercel.app**

- **左ペイン**: 入力テキスト / 入力言語 / 変換モード / 実行ボタン / 変換履歴
- **中央ペイン**: 翻訳結果（中間翻訳・再翻訳）+ コピー
- **右ペイン**: Positive Prompt / Negative Prompt / タグ詳細（カテゴリ・日本語意味）+ コピー

## 起動方法

### ダブルクリックで起動（推奨）

| ファイル | 動作 |
| --- | --- |
| `PromptBridge起動.bat` | サーバーを起動してブラウザを自動で開く |
| `PromptBridge終了.bat` | サーバーを停止する |

`PromptBridge起動.bat` をダブルクリックするだけで使えます。初回のみ依存関係のインストールとビルドが自動実行されます（数分）。2回目以降は数秒で起動します。すでに起動中の場合はブラウザを開くだけです。

サーバーは最小化された「PromptBridge Server」ウィンドウで動作します。終了は `PromptBridge終了.bat` のダブルクリック、またはそのウィンドウを閉じてください。

処理本体は `scripts/launcher.ps1` にあります（bat はエンコーディング問題を避けるための ASCII ラッパーです）。

### コマンドラインで起動（開発時）

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開いてください。

外部翻訳 API を設定する場合は `.env.local.example` をコピーして `.env.local` を作成します。

```bash
copy .env.local.example .env.local   # Windows
```

| 環境変数 | 説明 |
| --- | --- |
| `TRANSLATE_PROVIDER` | `auto`（既定） / `deepl` / `google` / `mock` |
| `DEEPL_API_KEY` | DeepL API のキー（任意）。設定すると DeepL を優先使用 |
| `GEMINI_API_KEY` | Gemini API のキー（任意）。LLM タグ抽出と画像→文章化に使用 |
| `OPENAI_API_KEY` | OpenAI API のキー（任意）。設定すると LLM タグ抽出・画像→文章化とも OpenAI（ChatGPT系モデル）を優先使用 |

`auto` の場合、**DeepL（キーがあれば）→ Google 翻訳無料エンドポイント → 辞書ベース簡易翻訳** の順にフォールバックします。API キーなしでも動作します（オフライン時は簡易翻訳になります）。

## 画像（イラスト）→ 文章化

入力ペインの「イラストを読み込んで文章化」から画像を読み込むと、Vision LLM が画像の内容を日本語の説明文にして入力欄へ反映します。そのまま「変換を実行」すれば、既存の翻訳・タグ変換フローに流せます。

- 読み込み方法: クリックしてファイル選択 / ドラッグ&ドロップ / Ctrl+V で貼り付け（対応形式: JPEG / PNG / WebP / GIF）
- 画像はブラウザ側で長辺 1536px の JPEG に縮小してから送信されます（通信量・API 消費の節約）
- 使用 API: `OPENAI_API_KEY` があれば OpenAI（既定 `gpt-4o-mini`）、なければ `GEMINI_API_KEY` で Gemini（既定 `gemini-2.5-flash`）。どちらも未設定の場合はエラーメッセージを表示します
- **注意**: OpenAI を使う場合、ChatGPT のアカウントでは利用できません。[platform.openai.com](https://platform.openai.com) での API キー発行とクレジット購入（従量課金）が必要です

## 変換モード

| モード | 処理 |
| --- | --- |
| 日本語 → 英語 → 日本語 | 往復翻訳（翻訳品質の確認用） |
| 英語 → 日本語 → 英語 | 往復翻訳 |
| 日本語 → 英語 → Danbooruタグ | 翻訳 + タグ抽出 |
| 英語 → 日本語 → Danbooruタグ | 翻訳 + タグ抽出 |

## 処理パイプライン

翻訳とタグ化は別処理として分離されています。

```
入力（日本語 / 英語）
  → translateText()             自然文翻訳（プロバイダ差し替え可能）
  → extractSemanticElements()   原文 + 翻訳文から意味要素を抽出（辞書エイリアス照合）
  → convertToDanbooruTags()     品質タグ・solo の自動付与などタグ集合へ変換
  → normalizeTags()             重複除去・排他タグ整理（例: 2girls があれば 1girl を除去）
  → sortTagsByCategory()        カテゴリ順 → priority 順にソート
  → Positive / Negative Prompt として出力
```

### タグの出力順（行ブロック構成）

Positive Prompt は SD 運用時のプロンプト構成に合わせ、役割ごとの行ブロックで出力されます（`lib/categories.ts` の `PROMPT_LINES` で定義）。

| 行 | 役割 | カテゴリ |
| --- | --- | --- |
| 1行目 | 品質・画風 | 品質、画風・スタイル、`〜background` 系タグ（white_background 等） |
| 2行目 | シチュエーション（ある場合のみ） | 背景、ライティング |
| 3行目 | キャラデザイン | 人数・主体、髪色、髪型、目、体 |
| 4行目 | 服装・持ち物 | 服装、その他（アイテム・武器等）、`holding〜` 系タグ |
| 5行目 | カメラ・表情・動作 | 構図・カメラ、表情、視線、ポーズ |

```text
masterpiece, best quality,
beach, sunset,
1girl, solo, blonde_hair,
white_dress,
smile, looking_at_viewer
```

各行はカンマで終わるため、全体として1つの有効なカンマ区切りプロンプトになります。行内はカテゴリ順 → priority 降順でソートされます。

### 辞書照合の仕組み（`lib/tagger.ts`）

- 日本語は**部分一致**、英語は**単語境界つき一致**（`girl` は `girls` にマッチしない）
- **長いエイリアス優先 + マッチ範囲の消費**により、「白いワンピース」に `white_dress` と `dress` が二重ヒットするのを防止
- タグモードでは**原文と翻訳文の両方**を照合するため、翻訳の揺れによる取りこぼしを軽減

## タグ辞書（3層構成）

| ファイル | 役割 |
| --- | --- |
| `data/tag-dictionary.json` | **手動管理**。豊富なエイリアス・優先度付き。常に優先される |
| `data/tag-dictionary.generated.json` | **自動生成**（約3,400タグ）。prompt-all-in-one 拡張のタグデータから取り込み（日英対訳あり） |
| `data/tag-dictionary.danbooru.json` | **自動生成**（約1,600タグ）。[Danbooru タグAPI](https://danbooru.donmai.us/tags.json) の使用頻度上位 general タグから取り込み（英語照合のみ） |

3層は `lib/dictionary.ts` でマージされ、同じタグは上の層が勝ちます。合計約5,000タグ。

### Danbooru からの取り込み

```bash
npm run import-danbooru        # 使用頻度上位3000タグから未収録分を取り込み
npm run import-danbooru -- 5   # ページ数指定（1ページ=1000タグ、最大10）
```

既存2層に存在するタグ・エイリアスは自動で除外されます。カテゴリはタグ名からヒューリスティックに推定します（`scripts/import-danbooru.mjs` の `LEX` で調整可能）。メタ情報系タグ（commentary等）と裸の一般名詞（head, face等。誤マッチの原因になる）は除外されます。

### 生成辞書の更新（prompt-all-in-one からの取り込み）

```bash
npm run import-tags
# パスを指定する場合
npm run import-tags -- "C:/path/to/group_tags/ja_JP.yaml"
```

既定では `C:\StabilityMatrix\Data\Packages\Stable Diffusion WebUI\extensions\prompt-all-in-one-ex\group_tags\ja_JP.yaml` を読み込み、拡張側のカテゴリ（人物/衣服/表情動作/画面/環境/シーン/アイテム/レンズ等）を本ツールのカテゴリへマッピングして `tag-dictionary.generated.json` を出力します。マッピングは `scripts/import-tags.mjs` の `GROUP_MAP` / `TOP_MAP` で調整できます。

取り込み時の安全策:

- 手動辞書に存在するタグ・エイリアスと衝突するものはスキップ（手動辞書優先）
- 品質タグの自動付与は `masterpiece` / `best quality` の2つのみ（生成辞書のquality系タグは入力にマッチした時だけ付く）
- Negative Prompt の初期値は手動辞書の `negative` カテゴリのみから生成
- 日本語照合エイリアスは2文字以上のみ（1文字の誤マッチ防止）

### 手動辞書のエントリ形式

エントリを追加するだけで抽出対象が増えます。

```json
{
  "tag": "blonde_hair",
  "ja": "金髪",
  "category": "hair",
  "aliases": ["金髪", "ブロンド", "黄色い髪", "blonde", "blond"],
  "priority": 100
}
```

- `tag`: 出力される Danbooru タグ
- `ja`: 日本語での意味（UI 表示にも使用）
- `category`: `quality` / `subject` / `hair` / `hair_style` / `eyes` / `clothing` / `expression` / `gaze` / `pose` / `camera` / `background` / `lighting` / `other` / `negative`
- `aliases`: 照合する表現（日本語・英語を混在可。ASCII か否かで自動判別）
- `priority`: 同一カテゴリ内での出力順（大きいほど先頭）

`negative` カテゴリのエントリが Negative Prompt の初期値になります。

## ディレクトリ構成

```
app/
  page.tsx              3ペインUI（クライアント）
  layout.tsx            ダークテーマレイアウト
  api/convert/route.ts  変換APIエンドポイント（サーバーサイド処理）
  api/describe/route.ts 画像→文章化APIエンドポイント
  api/status/route.ts   AI接続状態チェックAPIエンドポイント
components/
  CopyButton.tsx        コピー + トースト通知
  TagChipList.tsx       カテゴリ別タグチップ表示
  HistoryList.tsx       localStorage 履歴
lib/
  types.ts              型定義・モード定義
  translate.ts          translateText() と翻訳プロバイダ群
  mockTranslate.ts      オフライン辞書翻訳（フォールバック）
  tagger.ts             タグ抽出・正規化・ソート
  llmExtract.ts         LLM（Gemini）によるタグ抽出
  describeImage.ts      画像→日本語説明文（OpenAI / Gemini Vision）
  aiStatus.ts           APIキーの有効性チェック
data/
  tag-dictionary.json   タグ辞書
```

## 機能

- 4 つの変換モード（プルダウン切替。入力言語セレクトと連動）
- 画像（イラスト）→ 日本語説明文の生成（クリック選択 / ドラッグ&ドロップ / Ctrl+V 貼り付け）
- ヘッダーに AI 接続ステータスを常時表示。起動のたびに API キーの有効性を自動確認し、緑=接続OK / 赤=接続エラー / 灰=キー未設定 で表示（クリックで再確認。確認はモデル情報の取得のみで、無料枠は消費しません）
- コピー: 翻訳結果 / Positive / Negative / Positive+Negative（成功時トースト通知）
- 変換履歴: localStorage に直近 20 件保存、クリックで復元
- エラー処理: 空入力警告 / 翻訳 API 失敗表示 / 「該当タグなし」表示
- タグチップにカテゴリ・日本語意味・マッチ元の表現を表示（ホバー）
- Positive / Negative は手動編集してからコピー可能

## 今後 LLM API を組み込む場合の拡張ポイント

処理はすべてインターフェース単位で分離されているため、以下を差し替えるだけで LLM 化できます。

1. **翻訳の LLM 化** — `lib/translate.ts` の `Translator` インターフェースを実装し、`providerChain()` に追加する。

   ```ts
   const claudeTranslator: Translator = {
     name: "Claude API",
     available: () => !!process.env.ANTHROPIC_API_KEY,
     async translate(text, from, to) { /* Messages API を呼ぶ */ },
   };
   ```

2. **意味要素抽出の LLM 化** — `lib/tagger.ts` の `extractSemanticElements()` を、LLM に「文から視覚要素を JSON で抽出させる」実装に差し替える。戻り値の `MatchedTag[]` 形式を維持すれば、後段の `convertToDanbooruTags()` 以降は変更不要。

3. **タグ候補生成の LLM 化** — 辞書にない表現を LLM に Danbooru タグへマッピングさせ、`normalizeTags()` の前段で辞書マッチ結果とマージする（辞書は検証層として残すのが安全）。

4. **APIキー管理** — `.env.local` に `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` を追加（`.env.local.example` に雛形あり）。

## 制限事項（MVP）

- 翻訳は無料エンドポイント利用のため、精度・レート制限は保証されません
- タグ抽出は辞書ベースのため、辞書にない表現は拾えません（右ペインに「該当タグなし」と表示）
- 履歴からの復元ではタグ詳細チップは再表示されません（プロンプト文字列は復元されます）
