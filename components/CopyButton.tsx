"use client";

interface Props {
  text: string | null | undefined;
  label: string;
  notify: (message: string) => void;
  primary?: boolean;
  className?: string;
}

export default function CopyButton({ text, label, notify, primary = false, className = "" }: Props) {
  const disabled = !text;

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label}をコピーしました`);
    } catch {
      notify("コピーに失敗しました（ブラウザの権限を確認してください）");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition
        disabled:cursor-not-allowed disabled:opacity-40
        ${
          primary
            ? "border-accent/60 bg-accent/15 text-blue-200 hover:bg-accent/30 hover:text-white"
            : "border-panelBorder bg-[#1d2027] text-gray-300 hover:border-accent hover:text-white"
        } ${className}`}
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {label}をコピー
    </button>
  );
}
