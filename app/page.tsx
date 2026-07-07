"use client";

import { useCallback, useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import HistoryList from "@/components/HistoryList";
import TagChipList from "@/components/TagChipList";
import type {
  ConvertResponse,
  HistoryItem,
  Lang,
  Mode,
} from "@/lib/types";
import { MODE_LABELS, isTagMode, modeSourceLang } from "@/lib/types";

const MODES = Object.keys(MODE_LABELS) as Mode[];
const HISTORY_KEY = "promptbridge_history";
const HISTORY_MAX = 20;

type RightTab = "final" | "prompt";

function composeMode(lang: Lang, tagMode: boolean): Mode {
  if (lang === "ja") return tagMode ? "ja-en-tags" : "ja-en-ja";
  return tagMode ? "en-ja-tags" : "en-ja-en";
}

/** 翻訳方向を反転したモードを返す（日→英⇔英→日。変換タイプは維持） */
function flipMode(m: Mode): Mode {
  return composeMode(modeSourceLang(m) === "ja" ? "en" : "ja", isTagMode(m));
}

/** 文字種から入力言語を推定する（ひらがな・カタカナ・漢字があれば日本語） */
function detectLang(s: string): Lang | null {
  if (/[぀-ヿ㐀-鿿]/.test(s)) return "ja";
  if (/[a-zA-Z]/.test(s)) return "en";
  return null;
}

function PaneHeader({
  step,
  title,
  extra,
}: {
  step: string;
  title: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[46px] items-center justify-between gap-2 border-b border-panelBorder px-4 py-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/20 text-[11px] font-bold text-blue-300">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-gray-200">{title}</h2>
      </div>
      {extra}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <svg
        className="h-8 w-8 text-gray-700"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
      <p className="text-sm leading-relaxed text-gray-600">{message}</p>
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("ja-en-tags");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResponse | null>(null);
  const [positive, setPositive] = useState("");
  const [negative, setNegative] = useState("");
  const [rightTab, setRightTab] = useState<RightTab>("prompt");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const sourceLang = modeSourceLang(mode);
  const tagMode = isTagMode(mode);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* 壊れた履歴は無視 */
    }
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2000);
  }, []);

  const saveHistory = useCallback((item: HistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, HISTORY_MAX);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* localStorage が使えない環境では保存しない */
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const run = useCallback(async (textArg?: string, modeArg?: Mode) => {
    const inputText = textArg ?? text;
    let inputMode = modeArg ?? mode;
    if (!inputText.trim()) {
      setError("入力が空です。変換するテキストを入力してください。");
      return;
    }
    // 入力言語の自動判定: 文字種とモードの言語が食い違っていたら方向を自動補正
    const detected = detectLang(inputText);
    if (detected && detected !== modeSourceLang(inputMode)) {
      inputMode = composeMode(detected, isTagMode(inputMode));
      setMode(inputMode);
      notify(`入力言語を${detected === "ja" ? "日本語" : "英語"}と自動判定しました`);
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText, mode: inputMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `変換に失敗しました (HTTP ${res.status})`);
      }
      const converted = data as ConvertResponse;
      setResult(converted);
      setPositive(converted.positivePrompt ?? "");
      setNegative(converted.negativePrompt ?? "");
      setRightTab(isTagMode(converted.mode) ? "prompt" : "final");
      saveHistory({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode: converted.mode,
        sourceText: converted.sourceText,
        intermediate: converted.intermediate,
        final: converted.final,
        positivePrompt: converted.positivePrompt,
        negativePrompt: converted.negativePrompt,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch 自体が失敗 = サーバーに到達できていない
        setError(
          "サーバーに接続できません。「PromptBridge起動.bat」でサーバーを起動してから、ページを再読み込みして再実行してください。",
        );
      } else {
        setError(err instanceof Error ? err.message : "変換処理でエラーが発生しました");
      }
    } finally {
      setLoading(false);
    }
  }, [text, mode, saveHistory, notify]);

  /** DeepLの⇄と同じ: 訳文を入力欄に移し、翻訳方向を反転して再変換する */
  const swap = useCallback(() => {
    if (!result || loading) return;
    const newText = result.intermediate;
    const newMode = flipMode(result.mode);
    setText(newText);
    setMode(newMode);
    void run(newText, newMode);
  }, [result, loading, run]);

  const restoreHistory = useCallback((item: HistoryItem) => {
    setText(item.sourceText);
    setMode(item.mode);
    setResult({
      mode: item.mode,
      sourceText: item.sourceText,
      intermediate: item.intermediate,
      final: item.final,
      provider: "履歴から復元",
      tags: null,
      positivePrompt: item.positivePrompt,
      negativePrompt: item.negativePrompt,
      noTagsMatched: false,
    });
    setPositive(item.positivePrompt ?? "");
    setNegative(item.negativePrompt ?? "");
    setRightTab(item.positivePrompt ? "prompt" : "final");
    setError(null);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
    }
  };

  const combinedPrompt =
    positive || negative
      ? `Positive Prompt:\n${positive}\n\nNegative Prompt:\n${negative}`
      : null;

  const intermediateLangLabel = result
    ? modeSourceLang(result.mode) === "ja"
      ? "英語"
      : "日本語"
    : "";
  const finalLangLabel = result
    ? modeSourceLang(result.mode) === "ja"
      ? "日本語"
      : "英語"
    : "";

  const hasFinal = !!result?.final;
  const hasPrompt = !!result && (isTagMode(result.mode) || !!result.positivePrompt);

  const paneClass =
    "flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-panelBorder bg-panel shadow-lg shadow-black/20 lg:min-h-0";
  const textareaClass =
    "w-full resize-none rounded-md border border-panelBorder bg-[#12141a] p-3 text-sm leading-relaxed text-gray-100 placeholder:text-gray-600 focus:border-accent focus:outline-none";
  const selectClass =
    "w-full cursor-pointer rounded-md border border-panelBorder bg-[#1a1d24] px-2.5 py-2 text-sm text-gray-200 transition hover:border-gray-500 focus:border-accent focus:outline-none";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ===== ヘッダー ===== */}
      <header className="flex shrink-0 items-center justify-between border-b border-panelBorder bg-panel px-5 py-3">
        <h1 className="flex items-baseline gap-3">
          <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-lg font-bold text-transparent">
            PromptBridge
          </span>
          <span className="hidden text-xs text-gray-500 sm:inline">
            翻訳 & Stable Diffusion向け Danbooruタグ変換
          </span>
        </h1>
        <span className="rounded-full border border-panelBorder bg-[#1a1d24] px-3 py-1 text-[11px] text-gray-400">
          {MODE_LABELS[mode]}
        </span>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:overflow-hidden">
        {/* ===== 左ペイン: 入力 ===== */}
        <section className={paneClass}>
          <PaneHeader
            step="1"
            title="入力"
            extra={
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setError(null);
                }}
                disabled={!text}
                className="text-[11px] text-gray-500 underline-offset-2 transition hover:text-gray-300 hover:underline disabled:invisible"
              >
                クリア
              </button>
            }
          />
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                入力言語
                <select
                  value={sourceLang}
                  onChange={(e) => setMode(composeMode(e.target.value as Lang, tagMode))}
                  className={selectClass}
                >
                  <option value="ja">日本語</option>
                  <option value="en">英語</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                変換モード
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  className={selectClass}
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex min-h-[180px] flex-1 flex-col gap-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  sourceLang === "ja"
                    ? "例: 金髪の少女が白いワンピースを着て、夕焼けの海辺でこちらを見て微笑んでいる"
                    : "e.g. A blonde girl in a white dress is smiling at the viewer on a beach at sunset."
                }
                className={`${textareaClass} flex-1`}
              />
              <div className="text-right text-[11px] text-gray-600">{text.length} 文字</div>
            </div>

            <button
              type="button"
              onClick={() => void run()}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-accent to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/30 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {loading && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {loading ? "変換中..." : "変換を実行（Ctrl+Enter）"}
            </button>

            {error && (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
                {error}
              </p>
            )}

            <div className="border-t border-panelBorder pt-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                変換履歴
              </h3>
              <HistoryList items={history} onSelect={restoreHistory} onClear={clearHistory} />
            </div>
          </div>
        </section>

        {/* ===== 中央ペイン: 中間翻訳 ===== */}
        <section className={paneClass}>
          <PaneHeader
            step="2"
            title={result ? `中間翻訳（${intermediateLangLabel}）` : "翻訳結果"}
            extra={
              <div className="flex min-w-0 items-center gap-2">
                {result && (
                  <span className="hidden truncate text-[10px] text-gray-600 xl:inline">
                    翻訳: {result.provider}
                  </span>
                )}
                <button
                  type="button"
                  onClick={swap}
                  disabled={!result || loading}
                  title="原文と訳文を入れ替えて再変換（翻訳方向を反転）"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-panelBorder bg-[#1d2027] px-2.5 py-1.5 text-[11px] text-gray-300 transition hover:border-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 3 4 7l4 4" />
                    <path d="M4 7h16" />
                    <path d="m16 21 4-4-4-4" />
                    <path d="M20 17H4" />
                  </svg>
                  入れ替え
                </button>
              </div>
            }
          />
          {result ? (
            <>
              <div className="flex flex-1 flex-col overflow-hidden p-4">
                <textarea
                  readOnly
                  value={result.intermediate}
                  className={`${textareaClass} flex-1`}
                />
              </div>
              <div className="flex shrink-0 gap-2 border-t border-panelBorder px-4 py-2.5">
                <CopyButton text={result.intermediate} label="中間翻訳" notify={notify} />
              </div>
            </>
          ) : (
            <EmptyState message="左ペインでテキストを入力し「変換を実行」を押すと、ここに翻訳が表示されます" />
          )}
        </section>

        {/* ===== 右ペイン: 再翻訳 / SDプロンプト（タブ切替） ===== */}
        <section className={paneClass}>
          <div className="flex min-h-[46px] items-end gap-1 border-b border-panelBorder px-3 pt-2">
            <span className="mb-2 mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/20 text-[11px] font-bold text-blue-300">
              3
            </span>
            <button
              type="button"
              onClick={() => setRightTab("final")}
              disabled={!hasFinal}
              className={`rounded-t-md border border-b-0 px-3.5 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
                rightTab === "final"
                  ? "border-panelBorder bg-[#1d2027] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              再翻訳結果
            </button>
            <button
              type="button"
              onClick={() => setRightTab("prompt")}
              disabled={!!result && !hasPrompt}
              className={`rounded-t-md border border-b-0 px-3.5 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
                rightTab === "prompt"
                  ? "border-panelBorder bg-[#1d2027] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              Stable Diffusion プロンプト
            </button>
          </div>

          {/* --- 再翻訳タブ --- */}
          {rightTab === "final" && hasFinal && result && (
            <>
              <div className="flex flex-1 flex-col gap-1.5 overflow-hidden p-4">
                <span className="text-[11px] text-gray-500">
                  {finalLangLabel}に戻した結果（翻訳品質の確認用）
                </span>
                <textarea readOnly value={result.final ?? ""} className={`${textareaClass} flex-1`} />
              </div>
              <div className="flex shrink-0 gap-2 border-t border-panelBorder px-4 py-2.5">
                <CopyButton text={result.final} label="翻訳結果" notify={notify} primary />
              </div>
            </>
          )}

          {/* --- SDプロンプトタブ --- */}
          {rightTab === "prompt" && hasPrompt && result && (
            <>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                {result.noTagsMatched && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
                    該当タグなし: 入力文から辞書に一致するタグが見つかりませんでした（品質タグのみ出力しています）
                  </p>
                )}

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-green-400/70">
                    Positive Prompt
                  </span>
                  <textarea
                    value={positive}
                    onChange={(e) => setPositive(e.target.value)}
                    className="min-h-[110px] w-full resize-y rounded-md border border-panelBorder bg-[#12141a] p-3 font-mono text-xs leading-relaxed text-green-200 focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400/70">
                    Negative Prompt
                  </span>
                  <textarea
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    className="min-h-[80px] w-full resize-y rounded-md border border-panelBorder bg-[#12141a] p-3 font-mono text-xs leading-relaxed text-red-200 focus:border-accent focus:outline-none"
                  />
                </div>

                {result.tags && result.tags.length > 0 && (
                  <div className="border-t border-panelBorder pt-3">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      タグ詳細（ホバーでマッチ元を表示）
                    </h3>
                    <TagChipList tags={result.tags} />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-panelBorder px-4 py-2.5">
                <CopyButton text={positive} label="Positive" notify={notify} primary />
                <CopyButton text={negative} label="Negative" notify={notify} />
                <CopyButton text={combinedPrompt} label="両方" notify={notify} />
              </div>
            </>
          )}

          {/* --- 空状態 --- */}
          {(!result || (rightTab === "final" && !hasFinal) || (rightTab === "prompt" && !hasPrompt)) && (
            <EmptyState
              message={
                result
                  ? "このモードでは表示する内容がありません。タブまたは変換モードを切り替えてください。"
                  : "変換を実行すると、再翻訳結果または Stable Diffusion プロンプトがここに表示されます"
              }
            />
          )}
        </section>
      </main>

      {/* トースト通知 */}
      {toast && (
        <div className="animate-toast-in fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border border-accent/50 bg-[#1a2233] px-4 py-2.5 text-sm text-white shadow-xl shadow-black/40">
          <svg
            className="h-4 w-4 text-green-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
