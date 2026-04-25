"use client";

import { useState } from "react";
import SpaceSphere from "@/components/space-sphere";
import ChatSidebar from "@/components/chat-sidebar";
import PersonaBubble from "@/components/persona-bubble";

export default function HomePage() {
  const [hasFirstQuestion, setHasFirstQuestion] = useState(false);

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
          <PersonaBubble onFirstQuestion={() => setHasFirstQuestion(true)} />
        </div>
      </section>

      <ChatSidebar enabled={hasFirstQuestion} />
    </main>
  );
}
