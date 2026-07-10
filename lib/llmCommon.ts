/** OpenAI APIのエラーを利用者向けの日本語メッセージに変換する */
export function openAIFailureReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // "insufficient_quota" はエラー詳細の切り詰めで欠けることがあるため、本文の文言でも判定する
  if (msg.includes("insufficient_quota") || msg.includes("exceeded your current quota")) {
    return "OpenAIのクレジット残高がありません（platform.openai.com の Billing で購入が必要）";
  }
  if (msg.includes("HTTP 401")) return "OPENAI_API_KEY が無効です";
  if (msg.includes("HTTP 429")) return "OpenAI APIのレート制限に達しました";
  return "OpenAI APIの呼び出しに失敗しました";
}
