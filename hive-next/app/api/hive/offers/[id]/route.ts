import { previewNoLogin } from '@/lib/hive/preview-mode';
import { z } from 'zod';
import { getHiveAccessToken, assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['share', 'withdraw', 'delete']) }),
  z.object({ action: z.literal('send'), requestKey: z.string().uuid() }),
  z.object({
    action: z.literal('convert'),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).refine((value) => value.dueDate >= value.issueDate, {
    message: 'Fälligkeitsdatum liegt vor dem Rechnungsdatum',
  }),
  z.object({
    action: z.literal('duplicate'),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).refine((value) => value.validUntil >= value.issueDate, {
    message: 'Gültigkeitsdatum liegt vor dem Offertdatum',
  }),
]);
const draftSchema = z.object({
  workspaceId: z.string().uuid(),
  customerId: z.string().uuid(),
  projectId: z.union([z.string().uuid(), z.literal(''), z.null()]).default(null),
  title: z.string().trim().min(2).max(200),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxRate: z.number().min(0).max(100),
  notes: z.string().trim().max(4000).default(''),
  terms: z.string().trim().min(20).max(8000),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().positive().max(1_000_000),
    unitPriceRappen: z.number().int().min(0).max(9_000_000_000),
  })).min(1).max(20),
}).refine((value) => value.validUntil >= value.issueDate, {
  message: 'Gültigkeitsdatum liegt vor dem Offertdatum',
});

async function resolveOffer(
  supabase: Awaited<ReturnType<typeof requireHiveDataAccess>>,
  offerId: string,
) {
  const { data, error } = await supabase
    .from('offers')
    .select('id, workspace_id, customer_id, project_id, offer_number, title, issue_date, valid_until, status, notes, terms, subtotal_rappen, tax_rappen, total_rappen, accepted_at, created_at, updated_at')
    .eq('id', offerId)
    .single();
  if (error || !data) throw error || new Error('Offer not found');
  await assertWorkspaceAllowed(data.workspace_id, supabase);
  return data;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const offerId = idSchema.parse(id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);
    const offer = await resolveOffer(supabase, offerId);
    if (offer.workspace_id !== workspaceId) {
      return Response.json({ error:'Offerte gehört nicht zu diesem Business.' }, { status:409 });
    }
    const { data: items, error } = await supabase
      .from('offer_items')
      .select('id,position,description,quantity,unit_price_rappen')
      .eq('workspace_id', workspaceId)
      .eq('offer_id', offerId)
      .order('position');
    if (error) throw error;

    const taxRate = offer.subtotal_rappen > 0
      ? Math.round((Number(offer.tax_rappen) / Number(offer.subtotal_rappen)) * 10000) / 100
      : 0;

    return Response.json({ offer:{ ...offer, tax_rate:taxRate }, items:items ?? [] }, {
      headers:{ 'Cache-Control':'private, no-store' },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const offerId = idSchema.parse(id);
    const payload = draftSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);
    const offer = await resolveOffer(supabase, offerId);
    if (offer.workspace_id !== payload.workspaceId) {
      return Response.json({ error:'Offerte gehört nicht zu diesem Business.' }, { status:409 });
    }
    const { error } = await supabase.rpc('update_workspace_offer_draft', {
      p_offer_id:offerId,
      p_customer_id:payload.customerId,
      p_project_id:payload.projectId || null,
      p_title:payload.title,
      p_issue_date:payload.issueDate,
      p_valid_until:payload.validUntil,
      p_tax_rate:payload.taxRate,
      p_notes:payload.notes,
      p_terms:payload.terms,
      p_items:payload.items.map((item) => ({
        description:item.description,
        quantity:item.quantity,
        unit_price_rappen:item.unitPriceRappen,
      })),
    });
    if (error) {
      const message=String(error.message || '');
      if (message.includes('only draft')) {
        return Response.json({ error:'Nur Offertenentwürfe können bearbeitet werden.' }, { status:409 });
      }
      throw error;
    }
    return Response.json({ ok:true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const offerId = idSchema.parse(id);
    const action = actionSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    const offer = await resolveOffer(supabase, offerId);

    if (action.action === 'duplicate') {
      const { data:items, error:itemsError } = await supabase
        .from('offer_items')
        .select('description, quantity, unit_price_rappen')
        .eq('workspace_id', offer.workspace_id)
        .eq('offer_id', offerId)
        .order('position');
      if (itemsError) throw itemsError;
      if (!items?.length) {
        return Response.json({ error:'Offerte enthält keine Positionen und kann nicht dupliziert werden.' }, { status:409 });
      }

      const taxRate = offer.subtotal_rappen > 0
        ? Math.round((Number(offer.tax_rappen) / Number(offer.subtotal_rappen)) * 10000) / 100
        : 0;
      const { data, error } = await supabase.rpc('create_workspace_offer', {
        p_workspace_id:offer.workspace_id,
        p_customer_id:offer.customer_id,
        p_project_id:offer.project_id || null,
        p_title:`Kopie von ${offer.title}`,
        p_issue_date:action.issueDate,
        p_valid_until:action.validUntil,
        p_tax_rate:taxRate,
        p_notes:offer.notes || '',
        p_terms:offer.terms,
        p_items:items.map((item)=>({
          description:item.description,
          quantity:Number(item.quantity),
          unit_price_rappen:Number(item.unit_price_rappen),
        })),
      });
      if (error) throw error;
      return Response.json(
        { ok:true, offer:Array.isArray(data) ? data[0] : data },
        { status:201, headers:{ 'Cache-Control':'private, no-store' } },
      );
    }

    if (action.action === 'send') {
      if ((previewNoLogin() || process.env.HIVE_ENABLE_EMAIL_SEND !== 'true')) {
        return Response.json(
          { error:'E-Mail-Versand ist in der Hive-Dev-Preview deaktiviert.' },
          { status:403 },
        );
      }
      const token = await getHiveAccessToken();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!token) return Response.json({ error:'Authentication required' }, { status:401 });
      if (!supabaseUrl || !supabaseKey) {
        return Response.json({ error:'Offer email backend is not configured' }, { status:503 });
      }

      const upstream = await fetch(`${supabaseUrl}/functions/v1/offer-send`, {
        method:'POST',
        headers:{
          Authorization:`Bearer ${token}`,
          apikey:supabaseKey,
          'Content-Type':'application/json',
        },
        body:JSON.stringify({ offerId, requestKey:action.requestKey }),
        cache:'no-store',
      });
      const data = await upstream.json().catch(() => ({ error:'Offertenversand fehlgeschlagen.' }));
      return Response.json(data, {
        status:upstream.status,
        headers:{ 'Cache-Control':'private, no-store' },
      });
    }

    if (action.action === 'convert') {
      const { data, error } = await supabase.rpc('convert_workspace_offer_to_invoice_draft', {
        p_offer_id: offerId,
        p_issue_date: action.issueDate,
        p_due_date: action.dueDate,
      });
      if (error) {
        const message = String(error.message || '');
        if (message.includes('only accepted')) {
          return Response.json({ error: 'Nur angenommene Offerten können in Rechnungen umgewandelt werden.' }, { status: 409 });
        }
        if (message.includes('already converted')) {
          return Response.json({ error: 'Für diese Offerte existiert bereits eine Rechnung.' }, { status: 409 });
        }
        throw error;
      }
      return Response.json({ ok: true, invoice: Array.isArray(data) ? data[0] : data });
    }

    const rpc =
      action.action === 'share' ? 'share_workspace_offer'
      : action.action === 'withdraw' ? 'withdraw_workspace_offer'
      : 'delete_workspace_offer';

    const { error } = await supabase.rpc(rpc, { p_offer_id: offerId });
    if (error) {
      const message = String(error.message || '');
      if (message.includes('only draft offers')) {
        return Response.json({ error: 'Nur Offertenentwürfe können gelöscht werden.' }, { status: 409 });
      }
      if (message.includes('cannot be')) {
        return Response.json({ error: 'Diese Offertenaktion ist im aktuellen Status nicht möglich.' }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
