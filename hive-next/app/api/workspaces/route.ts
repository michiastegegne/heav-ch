import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Authenticated, RLS-scoped, read-only endpoint. Never accept a workspace ID
// from the client as authorization, and never use the service-role key here.
export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  try {
    const supabase = await createSupabaseServerClient();
    const { data: session, error: authError } = await supabase.auth.getUser();
    if (authError || !session.user)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { data: memberships, error } = await supabase
      .from('workspace_memberships')
      .select('workspace_id, role, workspaces(id, name, slug, status)')
      .eq('user_id', session.user.id);
    if (error) return NextResponse.json({ error: 'Unable to load permitted workspaces' }, { status: 500 });
    return NextResponse.json({ workspaces: memberships ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}
