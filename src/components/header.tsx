"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

  if (pathname !== "/") return null;

  const avatarUrl = getAvatarUrl(user);

  return (
    <header className="fixed right-5 top-5 z-50">
      {isReady && user ? (
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
          {avatarUrl ? (
            <img src={avatarUrl} alt="구글 프로필 이미지" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-slate-600">{user.email?.[0]?.toUpperCase() ?? "U"}</span>
          )}
        </div>
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
