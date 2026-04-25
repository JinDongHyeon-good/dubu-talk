"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function getAvatarUrl(user: User | null): string | null {
  if (!user) return null;
  const avatarFromMetadata = user.user_metadata?.avatar_url;
  if (typeof avatarFromMetadata === "string" && avatarFromMetadata.length > 0) {
    return avatarFromMetadata;
  }
  return null;
}

export default function Header() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const syncUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (isMounted) {
        setUser(currentUser);
        setIsReady(true);
      }
    };

    syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  if (pathname !== "/") return null;

  const avatarUrl = getAvatarUrl(user);

  const onLogout = async () => {
    setIsLoggingOut(true);
    setIsMenuOpen(false);
    await supabase.auth.signOut();
    setIsLoggingOut(false);
  };

  return (
    <header className="fixed right-5 top-5 z-50" ref={menuRef}>
      {isReady && user ? (
        <>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label="사용자 메뉴 열기"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="구글 프로필 이미지" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-slate-600">{user.email?.[0]?.toUpperCase() ?? "U"}</span>
            )}
          </button>

          <div
            className={`absolute right-0 mt-2 w-44 origin-top-right rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur transition-all duration-200 ${
              isMenuOpen
                ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                : "pointer-events-none -translate-y-1 scale-95 opacity-0"
            }`}
            role="menu"
          >
            <Link
              href="/chat-history"
              onClick={() => setIsMenuOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              role="menuitem"
            >
              채팅내역
            </Link>
            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              role="menuitem"
            >
              {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </div>
        </>
      ) : (
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          로그인
        </Link>
      )}
    </header>
  );
}
