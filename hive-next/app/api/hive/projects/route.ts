import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceQuery = z.string().uuid();
const dateValue = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]);

const projectSchema = z.object({
  workspaceId: z.string().uuid(),
  customerId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(6000).default(''),
  status: z.enum(['planning', 'active', 'completed', 'on_hold']).default('planning'),
  budgetRappen: z.number().int().min(0).max(9_000_000_000).default(0),
  startDate: dateValue.default(null),
  dueDate: dateValue.default(null),
}).refine((value) => !value.startDate || !value.dueDate || value.dueDate >= value.startDate, {
  message: 'Fälligkeitsdatum liegt vor dem Startdatum',
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = workspaceQuery.parse(url.searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);
    const { data, error } = await supabase
      .from('projects')
      .select('id, workspace_id, customer_id, department_id, title, description, status, budget_rappen, start_date, due_date, created_at, updated_at, customers(company, contact_name)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json({ projects: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = projectSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);

    const { data: department, error: departmentError } = await supabase
      .from('customer_departments')
      .select('id')
      .eq('workspace_id', payload.workspaceId)
      .eq('customer_id', payload.customerId)
      .eq('is_default', true)
      .eq('active', true)
      .single();
    if (departmentError || !department) {
      return Response.json({ error: 'Aktive Standardabteilung für den Kunden fehlt' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        workspace_id: payload.workspaceId,
        customer_id: payload.customerId,
        department_id: department.id,
        title: payload.title,
        description: payload.description || null,
        status: payload.status,
        budget_rappen: payload.budgetRappen,
        start_date: payload.startDate || null,
        due_date: payload.dueDate || null,
      })
      .select('id, workspace_id, customer_id, department_id, title, description, status, budget_rappen, start_date, due_date, created_at, updated_at')
      .single();
    if (error) throw error;
    return Response.json({ project: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
