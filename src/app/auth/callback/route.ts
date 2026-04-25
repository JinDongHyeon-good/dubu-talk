import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

function getSafeNextPath(raw: string | null) {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function buildAbsoluteRedirectUrl(request: Request, pathWithQuery: string) {
  const safePath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const requestOrigin = new URL(request.url).origin;
  const isLocalRequest =
    requestOrigin.startsWith("http://localhost:") ||
    requestOrigin.startsWith("http://127.0.0.1:");
  const localOrigin = isLocalRequest ? requestOrigin : "http://localhost:3000";
  return `${localOrigin}${safePath}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthDesc = url.searchParams.get("error_description");
  const nextPath = getSafeNextPath(url.searchParams.get("next"));

  if (oauthError) {
    const msg = oauthDesc || oauthError;
    return NextResponse.redirect(buildAbsoluteRedirectUrl(request, `/?error=${encodeURIComponent(msg)}`));
  }

  if (!code) {
    return NextResponse.redirect(buildAbsoluteRedirectUrl(request, "/?error=auth-code-error"));
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(buildAbsoluteRedirectUrl(request, "/?error=auth-code-error"));
    }
    const redirect = NextResponse.redirect(buildAbsoluteRedirectUrl(request, nextPath));
    redirect.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    redirect.headers.set("Pragma", "no-cache");
    redirect.headers.set("Expires", "0");
    return redirect;
  } catch {
    return NextResponse.redirect(buildAbsoluteRedirectUrl(request, "/?error=auth-code-error"));
  }
}
