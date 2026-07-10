import { NextResponse } from "next/server";
import { checkAiStatus } from "@/lib/aiStatus";

// 環境変数と外部APIの状態を毎回確認するため、ビルド時キャッシュを無効化
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await checkAiStatus();
  return NextResponse.json(status);
}
