import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceSchema = z.string().uuid();
const settingsSchema = z.object({
  workspaceId: z.string().uuid(),
  businessName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(160).optional(),
  contactName: z.string().trim().max(160).optional(),
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  phone: z.string().trim().max(80).optional(),
  websiteUrl: z.string().trim().max(300).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(30).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  logoUrl: z.string().trim().max(1000).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  invoiceSenderName: z.string().trim().max(160).optional(),
  iban: z.string().trim().max(80).optional(),
  bankName: z.string().trim().max(160).optional(),
  accountHolder: z.string().trim().max(160).optional(),
  uidNumber: z.string().trim().max(80).optional(),
  vatNumber: z.string().trim().max(80).optional(),
  vatEnabled: z.boolean().optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  defaultDueDays: z.number().int().min(1).max(180).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  invoicePrefix: z.string().regex(/^[A-Z0-9-]{1,12}$/).optional(),
  invoiceRemindersEnabled: z.boolean().optional(),
  invoiceReminderDays: z.number().int().min(1).max(30).optional(),
});

const fields = 'workspace_id, business_name, legal_name, contact_name, email, phone, website_url, address_line1, postal_code, city, country, logo_url, dark_logo_url, icon_url, primary_color, secondary_color, accent_color, invoice_sender_name, iban, bank_name, account_holder, uid_number, vat_number, vat_enabled, default_tax_rate, default_due_days, currency, invoice_prefix, invoice_number_format, invoice_reminders_enabled, invoice_reminder_days, updated_at';

export async function GET(request: Request) {
  try {
    const workspaceId = workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    assertWorkspaceAllowed(workspaceId);
    const supabase = await requireHiveDataAccess();
    const { data, error } = await supabase.from('workspace_settings').select(fields).eq('workspace_id', workspaceId).single();
    if (error) throw error;
    return Response.json({ settings: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = settingsSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();

    const updates: Record<string, unknown> = {};
    const map: Record<string, string> = {
      businessName: 'business_name', legalName: 'legal_name', contactName: 'contact_name',
      email: 'email', phone: 'phone', websiteUrl: 'website_url', addressLine1: 'address_line1',
      postalCode: 'postal_code', city: 'city', country: 'country', logoUrl: 'logo_url',
      primaryColor: 'primary_color', secondaryColor: 'secondary_color', accentColor: 'accent_color',
      invoiceSenderName: 'invoice_sender_name', iban: 'iban', bankName: 'bank_name',
      accountHolder: 'account_holder', uidNumber: 'uid_number', vatNumber: 'vat_number',
      vatEnabled: 'vat_enabled', defaultTaxRate: 'default_tax_rate',
      defaultDueDays: 'default_due_days', currency: 'currency', invoicePrefix: 'invoice_prefix',
      invoiceRemindersEnabled: 'invoice_reminders_enabled', invoiceReminderDays: 'invoice_reminder_days',
    };
    for (const [key, column] of Object.entries(map)) {
      const value = payload[key as keyof typeof payload];
      if (value !== undefined) updates[column] = value;
    }

    const { data, error } = await supabase
      .from('workspace_settings')
      .update(updates)
      .eq('workspace_id', payload.workspaceId)
      .select(fields)
      .single();
    if (error) throw error;
    return Response.json({ settings: data });
  } catch (error) {
    return jsonError(error);
  }
}
