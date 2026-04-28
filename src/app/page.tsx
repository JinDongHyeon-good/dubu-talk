"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SpaceSphere from "@/components/space-sphere";
import PersonaBubble from "@/components/persona-bubble";
import ChatRoomListSidebar from "@/components/chat-room-list-sidebar";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [hasFirstQuestion, setHasFirstQuestion] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [optimisticRoom, setOptimisticRoom] = useState<{ roomId: string; question: string } | null>(null);
  const [hasAnyRoom, setHasAnyRoom] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const ensureSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setIsSessionReady(true);
    };

    void ensureSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      setIsSessionReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!isSessionReady) return;

    let isMounted = true;

    const fetchHasAnyRoom = async () => {
      const response = await fetch("/api/chat/rooms");
      if (!response.ok || !isMounted) return;
      const data = (await response.json()) as { rooms?: Array<{ roomId: string }> };
      setHasAnyRoom((data.rooms?.length ?? 0) > 0);
    };

    void fetchHasAnyRoom();

    return () => {
      isMounted = false;
    };
  }, [isSessionReady]);

  if (!isSessionReady) {
    return null;
  }

  return (
    <main className="space-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
      <div className="space-nebula space-nebula-a" />
      <div className="space-nebula space-nebula-b" />
      <div className="space-nebula space-nebula-c" />
      <div className="space-stars space-stars-far" />
      <div className="space-stars space-stars-mid" />
      <div className="space-stars space-stars-near" />
      <div className="space-glow" />

      <section className="sphere-cloud-wrap relative z-10" aria-label="3D sphere">
        <SpaceSphere />
        <div
          className={`transition-all duration-500 ease-out ${
            hasFirstQuestion ? "pointer-events-none -translate-y-2 opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          <PersonaBubble
            onFirstQuestion={({ roomId, question }) => {
              setOptimisticRoom({ roomId, question });
              setHasFirstQuestion(true);
            }}
          />
        </div>
      </section>

      {hasAnyRoom || hasFirstQuestion || optimisticRoom ? <ChatRoomListSidebar optimisticRoom={optimisticRoom} /> : null}
    </main>
  );
}
