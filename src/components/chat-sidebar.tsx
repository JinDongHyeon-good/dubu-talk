"use client";

import { useState } from "react";

type ChatSidebarProps = {
  enabled: boolean;
};

export default function ChatSidebar({ enabled }: ChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!enabled) {
    return null;
  }

  return (
    <div className="absolute bottom-4 right-4 top-20 z-20 hidden md:block">
      <aside
        className={`h-full w-[380px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950/65 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-300 ease-out ${
          isOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-xs text-slate-400">Dubu Talk</p>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="채팅창 닫기"
          >
            ×
          </button>
        </div>

        <div className="h-[calc(100%-48px)] overflow-y-auto px-4 py-4" />
      </aside>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`absolute right-0 top-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-slate-950/78 text-slate-100 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.75)] backdrop-blur-xl transition-all duration-300 ease-out hover:bg-slate-900/90 ${
          isOpen ? "pointer-events-none translate-x-6 opacity-0" : "translate-x-0 opacity-100"
        }`}
        aria-label="채팅창 열기"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path
            d="M7 10.5h10M7 7.5h10M7 13.5h6M20 17.25V5.75A1.75 1.75 0 0 0 18.25 4H5.75A1.75 1.75 0 0 0 4 5.75v11.5A1.75 1.75 0 0 0 5.75 19h8.32a2 2 0 0 1 1.11.34L19 21.9v-2.65a1 1 0 0 1 1-1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
