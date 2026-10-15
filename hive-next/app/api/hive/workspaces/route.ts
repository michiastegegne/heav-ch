import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createClerkSupabaseServerClient } from '@/lib/supabase/clerk-server';

export async function GET() {
  if (process.env.HIVE_CLERK_DB_BRIDGE_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Clerk database bridge is not enabled yet' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const supabase = await createClerkSupabaseServerClient();
    const { data, error } = await supabase
      .from('workspace_memberships')
      .select('workspace_id, role, workspaces(id, name, slug, status)')
      .order('created_at');

    if (error) {
      return NextResponse.json({ error: 'Unable to load permitted workspaces' }, { status: 500 });
    }

    return NextResponse.json(
      { workspaces: data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Workspace backend unavailable' }, { status: 503 });
  }
}
