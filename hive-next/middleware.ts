import { createServerClient } from '@supabase/ssr';
import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/studio(.*)',
  '/account(.*)',
  '/api/hive(.*)',
]);

const clerk = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect();
});

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const authState = getHiveAuthState();
  const api = request.nextUrl.pathname.startsWith('/api/');

  if (!authState.ready) {
    if (!isProtectedRoute(request)) return NextResponse.next();
    if (api) {
      return NextResponse.json(
        { error: 'Die Anmeldung ist noch nicht vollständig eingerichtet.' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    const target = new URL('/login', request.url);
    target.searchParams.set('setup', authState.issue || 'auth');
    return NextResponse.redirect(target);
  }

  if (authState.requested === 'clerk') return clerk(request, event);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isProtectedRoute(request)) return NextResponse.next();
  if (!url || !key) {
    return api
      ? NextResponse.json({ error: 'Die Anmeldung ist noch nicht eingerichtet.' }, { status: 503 })
      : NextResponse.redirect(new URL('/login', request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    const denied = api
      ? NextResponse.json({ error: 'Bitte melde dich erneut an.' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
    for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
    denied.headers.set('Cache-Control', 'private, no-store');
    return denied;
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
