"use client";

import { useState } from "react";
import SpaceSphere from "@/components/space-sphere";
import ChatSidebar from "@/components/chat-sidebar";
import ChatRoomListSidebar from "@/components/chat-room-list-sidebar";

type ChatRoomPageViewProps = {
  roomId: string;
};

export default function ChatRoomPageView({ roomId }: ChatRoomPageViewProps) {
  const [isSphereReady, setIsSphereReady] = useState(false);
  const [isConversationActive, setIsConversationActive] = useState(false);

  return (
    <main
      className={`space-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16 ${
        isSphereReady ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="space-nebula space-nebula-a" />
      <div className="space-nebula space-nebula-b" />
      <div className="space-nebula space-nebula-c" />
      <div className="space-stars space-stars-far" />
      <div className="space-stars space-stars-mid" />
      <div className="space-stars space-stars-near" />
      <div className="space-glow" />
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 z-[9] h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2ef6c0]/40 blur-[90px] transition-opacity duration-500 ${
          isConversationActive ? "opacity-100" : "opacity-0"
        }`}
      />

      <section className="sphere-cloud-wrap relative z-10" aria-label="3D sphere">
        <SpaceSphere onReady={() => setIsSphereReady(true)} />
      </section>

      <ChatRoomListSidebar />
      <ChatSidebar roomId={roomId} onConversationActiveChange={setIsConversationActive} />
    </main>
  );
}
