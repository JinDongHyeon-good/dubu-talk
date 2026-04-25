"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isLoading, setIsLoading] = useState(false);

  const onGoogleLogin = async () => {
    setIsLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    setIsLoading(false);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6">
      <section className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-3xl font-semibold tracking-tight">Dubu test</h1>
        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-[#dadce0] bg-white px-4 py-3 text-sm font-medium text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303C33.655 32.657 29.198 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.053 6.053 29.277 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
            />
            <path
              fill="#FF3D00"
              d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.053 6.053 29.277 4 24 4c-7.682 0-14.347 4.337-17.694 10.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.176 0 9.86-1.977 13.409-5.193l-6.19-5.238C29.153 35.091 26.715 36 24 36c-5.177 0-9.623-3.329-11.283-7.946l-6.522 5.025C9.507 39.556 16.227 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303a12.03 12.03 0 0 1-4.084 5.569l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
            />
          </svg>
          <span>{isLoading ? "로그인 중..." : "Google 계정으로 로그인"}</span>
        </button>
      </section>
    </main>
  );
}
