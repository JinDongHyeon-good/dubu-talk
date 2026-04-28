"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type RoomItem = {
  roomId: string;
  lastQuestion: string;
  lastCreatedAt: string;
};

type OptimisticRoom = {
  roomId: string;
  question: string;
};

function toDisplayDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChatRoomListSidebar({ optimisticRoom }: { optimisticRoom?: OptimisticRoom | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [localOptimisticRoom, setLocalOptimisticRoom] = useState<OptimisticRoom | null>(null);
  const [deleteTargetRoomId, setDeleteTargetRoomId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentRoomId = useMemo(() => {
    if (!pathname.startsWith("/chat/")) return "";
    return pathname.replace("/chat/", "");
  }, [pathname]);

  const effectiveOptimisticRoom = optimisticRoom ?? localOptimisticRoom;
  const shouldShowOptimisticRoom =
    Boolean(effectiveOptimisticRoom?.roomId) &&
    Boolean(effectiveOptimisticRoom?.question?.trim()) &&
    effectiveOptimisticRoom?.question !== "실시간 대화 시작";

  const displayedRooms = useMemo(() => {
    let merged = rooms;

    if (shouldShowOptimisticRoom && effectiveOptimisticRoom && !merged.some((room) => room.roomId === effectiveOptimisticRoom.roomId)) {
      merged = [
        {
          roomId: effectiveOptimisticRoom.roomId,
          lastQuestion: effectiveOptimisticRoom.question,
          lastCreatedAt: new Date().toISOString(),
        },
        ...merged,
      ];
    }

    return merged;
  }, [rooms, effectiveOptimisticRoom, shouldShowOptimisticRoom]);

  const fetchRooms = useCallback(async () => {
    const response = await fetch("/api/chat/rooms");
    if (!response.ok) return;
    const data = (await response.json()) as { rooms?: RoomItem[] };
    setRooms(data.rooms ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRooms();
  }, [pathname, fetchRooms]);

  useEffect(() => {
    const onOptimistic = (event: Event) => {
      const customEvent = event as CustomEvent<OptimisticRoom>;
      if (!customEvent.detail?.roomId || !customEvent.detail?.question) return;
      setLocalOptimisticRoom(customEvent.detail);
    };

    const onRefresh = () => {
      void fetchRooms();
    };

    window.addEventListener("chat-room-optimistic", onOptimistic as EventListener);
    window.addEventListener("chat-room-refresh", onRefresh);

    return () => {
      window.removeEventListener("chat-room-optimistic", onOptimistic as EventListener);
      window.removeEventListener("chat-room-refresh", onRefresh);
    };
  }, [fetchRooms]);

  const onStartNewRoom = () => {
    router.push(`/chat/${crypto.randomUUID()}`);
  };

  const onDeleteRoom = async () => {
    if (!deleteTargetRoomId || isDeleting) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/chat/rooms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: deleteTargetRoomId }),
      });
      if (!response.ok) return;

      setRooms((prev) => prev.filter((room) => room.roomId !== deleteTargetRoomId));
      if (currentRoomId === deleteTargetRoomId) {
        router.push("/");
      }
      setDeleteTargetRoomId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`absolute bottom-4 left-4 top-20 hidden md:block ${deleteTargetRoomId ? "z-[130]" : "z-20"}`}>
      <aside
        className={`flex h-full w-[280px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950/65 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-300 ease-out ${
          isOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-8 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-xs text-slate-300">채팅방 목록</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onStartNewRoom}
              className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-[11px] text-slate-100 transition hover:bg-white/10"
            >
              새 대화
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="채팅방 목록 닫기"
            >
              ×
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {displayedRooms.map((room) => {
            const active = room.roomId === currentRoomId;
            return (
              <div
                key={room.roomId}
                className={`block rounded-lg border px-3 py-2 transition ${
                  active
                    ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Link href={`/chat/${room.roomId}`} className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{room.lastQuestion || "질문 없음"}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{toDisplayDate(room.lastCreatedAt)}</p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetRoomId(room.roomId)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-md text-rose-300 transition hover:bg-rose-500/20 hover:text-rose-100"
                    aria-label="채팅방 삭제"
                  >
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                      <path
                        d="M8.5 5.75h7M6.75 8h10.5m-9.5 0 .55 9a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.55-9m-6.2 0V6.2c0-.66.54-1.2 1.2-1.2h1.9c.66 0 1.2.54 1.2 1.2V8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {deleteTargetRoomId ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="w-[280px] rounded-xl border border-white/15 bg-slate-900/95 p-4 shadow-xl">
            <p className="text-sm font-medium text-slate-100">정말 삭제하시겠습니까?</p>
            <p className="mt-1 text-xs text-slate-400">삭제하면 해당 채팅방의 대화 내역을 복구할 수 없습니다.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetRoomId(null)}
                disabled={isDeleting}
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onDeleteRoom}
                disabled={isDeleting}
                className="rounded-md border border-rose-300/30 bg-rose-500/20 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-60"
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`absolute left-0 top-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-slate-950/78 text-slate-100 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.75)] backdrop-blur-xl transition-all duration-300 ease-out hover:bg-slate-900/90 ${
          isOpen ? "pointer-events-none -translate-x-6 opacity-0" : "translate-x-0 opacity-100"
        }`}
        aria-label="채팅방 목록 열기"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path
            d="M4 6.75h16M4 12h10M4 17.25h13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
