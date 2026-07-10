import { NextResponse } from "next/server";
import { describeAvailable, describeImage } from "@/lib/describeImage";
import type { DescribeResponse } from "@/lib/types";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// base64は元サイズの約1.33倍。約9MBの画像まで受け付ける（クライアント側で縮小済みの想定）
const MAX_BASE64_LENGTH = 12 * 1024 * 1024;

export async function POST(req: Request) {
  if (!describeAvailable()) {
    return NextResponse.json(
      {
        error:
          "画像の文章化にはAPIキーが必要です。.env.local に GEMINI_API_KEY または OPENAI_API_KEY を設定してください。",
      },
      { status: 503 },
    );
  }

  let body: { image?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";

  if (!image) {
    return NextResponse.json({ error: "画像データが空です" }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json(
      { error: "対応していない画像形式です（JPEG / PNG / WebP / GIF）" },
      { status: 400 },
    );
  }
  if (image.length > MAX_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "画像サイズが大きすぎます（約9MB以下にしてください）" },
      { status: 413 },
    );
  }

  try {
    const { description, provider } = await describeImage(image, mimeType);
    const res: DescribeResponse = { description, provider };
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "画像の文章化でエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
