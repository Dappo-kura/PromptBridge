import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PromptBridge — 翻訳 & Danbooruタグ変換",
  description:
    "日本語・英語の翻訳と、Stable Diffusion向けDanbooruタグプロンプト変換を行う3ペインツール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body
        className={`${notoSansJP.className} min-h-screen bg-[#0e1015] text-gray-200 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
