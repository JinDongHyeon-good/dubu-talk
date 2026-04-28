"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PersonaBubbleProps = {
  onStartChat?: (roomId: string) => void;
};

export default function PersonaBubble({ onStartChat }: PersonaBubbleProps) {
  const [isStarting, setIsStarting] = useState(false);
  const router = useRouter();
  const onStartLiveChat = () => {
    const roomId = crypto.randomUUID();
    setIsStarting(true);
    onStartChat?.(roomId);
    router.push(`/chat/${roomId}`);
  };

  return (
    <div className="persona-bubble">
      <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="persona-bubble-desc !m-0 flex h-9 items-center leading-none -translate-y-px">
          진동현 지원자에 대해서 알고 싶다면 질문을 해주세요
        </p>
        <button
          type="button"
          onClick={onStartLiveChat}
          disabled={isStarting}
          className="inline-flex h-9 shrink-0 self-center items-center justify-center rounded-lg bg-cyan-300/85 px-3 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isStarting ? "입장 중..." : "실시간 대화 시작"}
        </button>
      </div>
    </div>
  );
}
