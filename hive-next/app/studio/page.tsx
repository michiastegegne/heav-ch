'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CreditCard, FileText,
  LayoutDashboard, Mail, Package, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, Users, X,
} from 'lucide-react';
import { createPublicSupabaseBrowserClient } from '@/lib/supabase/public-browser';
import './studio.css';

type Workspace = { id: string; name: string; slug: string; status: string; role: string };
type Customer = {
  id: string; workspace_id: string; company: string | null; contact_name: string | null;
  email: string | null; phone: string | null; address_line1: string | null;
  postal_code: string | null; city: string | null; country: string | null; notes: string | null;
};
type Project = {
  id: string; workspace_id: string; customer_id: string; title: string; description: string | null;
  status: 'planning' | 'active' | 'completed' | 'on_hold'; budget_rappen: number;
  start_date: string | null; due_date: string | null;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type Invoice = {
  id: string; workspace_id: string; customer_id: string; project_id: string | null;
  invoice_number: string; issue_date: string; due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'; currency: string;
  tax_rate: number; subtotal_rappen: number; tax_rappen: number; total_rappen: number;
  sent_at: string | null; paid_at: string | null; is_legacy: boolean;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type Offer = {
  id: string; workspace_id: string; customer_id: string; project_id: string | null;
  offer_number: string; title: string; issue_date: string; valid_until: string; status: string;
  subtotal_rappen: number; tax_rappen: number; total_rappen: number; accepted_at: string | null;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type EmailLog = {
  id: string; template_key: string; status: string; recipient_email: string;
  recipient_name: string; subject: string; error_message: string | null; created_at: string;
};
type Settings = {
  workspace_id: string; business_name: string; legal_name: string; contact_name: string; email: string;
  phone: string; website_url: string; address_line1: string; postal_code: string; city: string;
  country: string; logo_url: string; primary_color: string; secondary_color: string; accent_color: string;
  invoice_sender_name: string; iban: string; bank_name: string; account_holder: string;
  uid_number: string; vat_number: string; vat_enabled: boolean; default_tax_rate: number;
  default_due_days: number; currency: string; invoice_prefix: string;
};
type PortalMembership = { id:string; customer_id:string; department_id:string; user_id:string; role:string; status:string; invited_at:string; accepted_at:string|null; revoked_at:string|null; created_at:string };
type PortalInvite = { id:string; customer_id:string; department_id:string; email:string; expires_at:string; accepted_at:string|null; revoked_at:string|null; created_at:string };
type PortalRequest = { id:string; customer_id:string|null; company:string; contact_name:string; email:string; phone:string; message:string; status:string; reviewed_at:string|null; created_at:string };
type PortalFile = { id:string; customer_id:string; project_id:string|null; title:string; original_filename:string; kind:string; bytes:number|null; download_enabled:boolean; published_at:string|null; expires_at:string|null; created_at:string };
type PortalReview = { id:string; customer_id:string; reviewer_name:string; body:string; status:string; published_at:string|null; created_at:string };
type PortalActivity = { id:string; customer_id:string|null; actor_type:string; visibility:string; event_type:string; entity_type:string; summary:string; created_at:string };
type PortalData = { memberships:PortalMembership[]; invites:PortalInvite[]; requests:PortalRequest[]; files:PortalFile[]; reviews:PortalReview[]; activity:PortalActivity[] };
type ProjectTask = { id:string; title:string; description:string; status:'todo'|'in_progress'|'blocked'|'done'; priority:'low'|'normal'|'high'; due_date:string|null; completed_at:string|null };
type ProjectDeliverable = { id:string; title:string; description:string; status:'planned'|'in_progress'|'review'|'approved'|'delivered'; due_date:string|null; file_id:string|null; delivered_at:string|null };
type ProjectWorkspaceData = {
  project: Pick<Project,'id'|'title'|'status'|'budget_rappen'|'start_date'|'due_date'>;
  tasks: ProjectTask[];
  deliverables: ProjectDeliverable[];
  files: Array<{id:string;title:string;original_filename:string;kind:string;published_at:string|null}>;
  activity: Array<{id:string;event_type:string;entity_type:string;summary:string;visibility:string;created_at:string}>;
};
type Product = {
  id:string; workspace_id:string; name:string; description:string; sku:string;
  unit_price_rappen:number; tax_rate:number; active:boolean; created_at:string; updated_at:string;
};

type Tab = 'overview' | 'customers' | 'projects' | 'invoices' | 'offers' | 'catalog' | 'emails' | 'portal' | 'branding';
type LineDraft = { description: string; quantity: number; unitPrice: number };

const today = () => new Date().toISOString().slice(0, 10);
const afterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const money = (rappen: number, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format((Number(rappen) || 0) / 100);
const customerName = (customer?: Partial<Customer> | null) =>
  customer?.company?.trim() || customer?.contact_name?.trim() || 'Ohne Name';
const relatedName = (relation?: { company?: string | null; contact_name?: string | null } | null) =>
  relation?.company?.trim() || relation?.contact_name?.trim() || 'Kunde';

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Anfrage fehlgeschlagen';
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [portal, setPortal] = useState<PortalData>({ memberships:[], invites:[], requests:[], files:[], reviews:[], activity:[] });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(true);
  const [backendError, setBackendError] = useState('');
  const [notice, setNotice] = useState('');

  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({
    id: '', company: '', contactName: '', email: '', phone: '',
    addressLine1: '', postalCode: '', city: '', country: 'Schweiz', notes: '',
  });
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectWorkspaceOpen, setProjectWorkspaceOpen] = useState(false);
  const [projectWorkspace, setProjectWorkspace] = useState<ProjectWorkspaceData | null>(null);
  const [projectWorkspaceId, setProjectWorkspaceId] = useState('');
  const [taskDraft, setTaskDraft] = useState({ title:'', description:'', priority:'normal' as ProjectTask['priority'], dueDate:'' });
  const [deliverableDraft, setDeliverableDraft] = useState({ title:'', description:'', dueDate:'', fileId:'' });
  const [projectDraft, setProjectDraft] = useState({
    id: '', customerId: '', title: '', description: '', status: 'planning' as Project['status'],
    budget: 0, startDate: '', dueDate: '',
  });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState({
    id: '', customerId: '', projectId: '', issueDate: today(), dueDate: afterDays(30),
    taxRate: 0, notes: '', lines: [{ description: '', quantity: 1, unitPrice: 0 }] as LineDraft[],
  });
  const [offerOpen, setOfferOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [productDraft, setProductDraft] = useState({ id:'', name:'', description:'', sku:'', unitPrice:0, taxRate:0, active:true });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState({ customerId:'', email:'' });
  const [fileOpen, setFileOpen] = useState(false);
  const [fileDraft, setFileDraft] = useState<{ customerId:string; projectId:string; title:string; kind:'image'|'video'|'gallery'|'offer'|'document'; file:File|null }>({
    customerId:'', projectId:'', title:'', kind:'document', file:null,
  });
  const [offerDraft, setOfferDraft] = useState({
    customerId: '', projectId: '', title: '', issueDate: today(), validUntil: afterDays(30),
    taxRate: 0, notes: '', terms: 'Diese Offerte ist bis zum angegebenen Datum gültig.',
    lines: [{ description: '', quantity: 1, unitPrice: 0 }] as LineDraft[],
  });

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null;
  const businessName = settings?.business_name || activeWorkspace?.name || 'Hive';
  const accent = settings?.accent_color || '#191919';

  const loadWorkspaces = useCallback(async () => {
    setBusy(true);
    setBackendError('');
    try {
      const data = await requestJson<{ workspaces: Workspace[] }>('/api/hive/workspaces');
      setWorkspaces(data.workspaces);
      setActiveWorkspaceId((current) =>
        data.workspaces.some((workspace) => workspace.id === current) ? current : (data.workspaces[0]?.id || ''),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend nicht erreichbar';
      setBackendError(message);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadWorkspaceData = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    setBusy(true);
    setBackendError('');
    try {
      const q = encodeURIComponent(workspaceId);
      const [customerData, projectData, invoiceData, offerData, productData, emailData, portalData, settingsData] = await Promise.all([
        requestJson<{ customers: Customer[] }>(`/api/hive/customers?workspace=${q}`),
        requestJson<{ projects: Project[] }>(`/api/hive/projects?workspace=${q}`),
        requestJson<{ invoices: Invoice[] }>(`/api/hive/invoices?workspace=${q}`),
        requestJson<{ offers: Offer[] }>(`/api/hive/offers?workspace=${q}`),
        requestJson<{ products: Product[] }>(`/api/hive/products?workspace=${q}`),
        requestJson<{ emails: EmailLog[] }>(`/api/hive/emails?workspace=${q}`),
        requestJson<PortalData>(`/api/hive/portal?workspace=${q}`),
        requestJson<{ settings: Settings }>(`/api/hive/settings?workspace=${q}`),
      ]);
      setCustomers(customerData.customers);
      setProjects(projectData.projects);
      setInvoices(invoiceData.invoices);
      setOffers(offerData.offers);
      setProducts(productData.products);
      setEmails(emailData.emails);
      setPortal(portalData);
      setSettings(settingsData.settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workspace konnte nicht geladen werden';
      setBackendError(message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => { if (activeWorkspaceId) void loadWorkspaceData(activeWorkspaceId); }, [activeWorkspaceId, loadWorkspaceData]);

  const invoiceTotal = useMemo(
    () => invoiceDraft.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice * 100), 0),
    [invoiceDraft.lines],
  );
  const offerTotal = useMemo(
    () => offerDraft.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice * 100), 0),
    [offerDraft.lines],
  );

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      const payload = { workspaceId: activeWorkspaceId, ...customerDraft };
      if (customerDraft.id) {
        await requestJson(`/api/hive/customers/${customerDraft.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await requestJson('/api/hive/customers', { method: 'POST', body: JSON.stringify(payload) });
      }
      setCustomerOpen(false);
      setNotice(customerDraft.id ? 'Kunde aktualisiert.' : 'Kunde erstellt.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Kunde konnte nicht gespeichert werden.');
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!activeWorkspaceId || !confirm(`${customerName(customer)} wirklich löschen?`)) return;
    try {
      await requestJson(`/api/hive/customers/${customer.id}?workspace=${encodeURIComponent(activeWorkspaceId)}`, { method: 'DELETE' });
      setNotice('Kunde gelöscht.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Kunde konnte nicht gelöscht werden.');
    }
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      const payload = {
        workspaceId: activeWorkspaceId,
        customerId: projectDraft.customerId,
        title: projectDraft.title,
        description: projectDraft.description,
        status: projectDraft.status,
        budgetRappen: Math.round(projectDraft.budget * 100),
        startDate: projectDraft.startDate || null,
        dueDate: projectDraft.dueDate || null,
      };
      if (projectDraft.id) {
        await requestJson(`/api/hive/projects/${projectDraft.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            workspaceId: activeWorkspaceId,
            title: payload.title,
            description: payload.description,
            status: payload.status,
            budgetRappen: payload.budgetRappen,
            startDate: payload.startDate,
            dueDate: payload.dueDate,
          }),
        });
      } else {
        await requestJson('/api/hive/projects', { method: 'POST', body: JSON.stringify(payload) });
      }
      setProjectOpen(false);
      setNotice(projectDraft.id ? 'Projekt aktualisiert.' : 'Projekt erstellt.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Projekt konnte nicht gespeichert werden.');
    }
  }

  async function loadProjectWorkspace(projectId: string) {
    if (!activeWorkspaceId) return;
    try {
      const data = await requestJson<ProjectWorkspaceData>(
        `/api/hive/project-workspace?workspace=${encodeURIComponent(activeWorkspaceId)}&project=${encodeURIComponent(projectId)}`,
      );
      setProjectWorkspace(data);
      setProjectWorkspaceId(projectId);
      setProjectWorkspaceOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Projekt-Workspace konnte nicht geladen werden.');
    }
  }

  async function projectWorkspaceAction(payload: Record<string, unknown>, successMessage: string) {
    if (!activeWorkspaceId || !projectWorkspaceId) return;
    try {
      await requestJson('/api/hive/project-workspace', {
        method:'POST',
        body:JSON.stringify({ workspaceId:activeWorkspaceId, projectId:projectWorkspaceId, ...payload }),
      });
      setNotice(successMessage);
      const data = await requestJson<ProjectWorkspaceData>(
        `/api/hive/project-workspace?workspace=${encodeURIComponent(activeWorkspaceId)}&project=${encodeURIComponent(projectWorkspaceId)}`,
      );
      setProjectWorkspace(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Projekt-Aktion fehlgeschlagen.');
    }
  }

  async function createProjectTask(event: FormEvent) {
    event.preventDefault();
    await projectWorkspaceAction({
      action:'create_task',
      title:taskDraft.title,
      description:taskDraft.description,
      priority:taskDraft.priority,
      dueDate:taskDraft.dueDate || null,
    }, 'Task erstellt.');
    setTaskDraft({ title:'', description:'', priority:'normal', dueDate:'' });
  }

  async function createProjectDeliverable(event: FormEvent) {
    event.preventDefault();
    await projectWorkspaceAction({
      action:'create_deliverable',
      title:deliverableDraft.title,
      description:deliverableDraft.description,
      dueDate:deliverableDraft.dueDate || null,
      fileId:deliverableDraft.fileId || null,
    }, 'Deliverable erstellt.');
    setDeliverableDraft({ title:'', description:'', dueDate:'', fileId:'' });
  }

  async function deleteProject(project: Project) {
    if (!activeWorkspaceId || !confirm(`${project.title} wirklich löschen?`)) return;
    try {
      await requestJson(`/api/hive/projects/${project.id}`, { method: 'DELETE' });
      setNotice('Projekt gelöscht.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Projekt konnte nicht gelöscht werden.');
    }
  }

  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      const invoicePayload = {
          workspaceId: activeWorkspaceId,
          customerId: invoiceDraft.customerId,
          projectId: invoiceDraft.projectId || null,
          issueDate: invoiceDraft.issueDate,
          dueDate: invoiceDraft.dueDate,
          taxRate: invoiceDraft.taxRate,
          notes: invoiceDraft.notes,
          items: invoiceDraft.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitPriceRappen: Math.round(line.unitPrice * 100),
          })),
      };
      if (invoiceDraft.id) {
        await requestJson(`/api/hive/invoices/${invoiceDraft.id}`, {
          method:'PATCH',
          body:JSON.stringify(invoicePayload),
        });
      } else {
        await requestJson('/api/hive/invoices', {
          method:'POST',
          body:JSON.stringify(invoicePayload),
        });
      }
      setInvoiceOpen(false);
      setNotice(invoiceDraft.id ? 'Rechnungsentwurf aktualisiert.' : 'Rechnungsentwurf erstellt.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rechnung konnte nicht erstellt werden.');
    }
  }

  async function openInvoiceDraft(invoice: Invoice) {
    if (!activeWorkspaceId || invoice.is_legacy || invoice.status !== 'draft') return;
    try {
      const data = await requestJson<{
        invoice: Invoice & { notes?:string|null };
        items: Array<{description:string;quantity:number|string;unit_price_rappen:number}>;
      }>(`/api/hive/invoices/${invoice.id}?workspace=${encodeURIComponent(activeWorkspaceId)}`);
      setInvoiceDraft({
        id:invoice.id,
        customerId:data.invoice.customer_id,
        projectId:data.invoice.project_id || '',
        issueDate:data.invoice.issue_date,
        dueDate:data.invoice.due_date,
        taxRate:Number(data.invoice.tax_rate),
        notes:data.invoice.notes || '',
        lines:data.items.map((item) => ({
          description:item.description,
          quantity:Number(item.quantity),
          unitPrice:Number(item.unit_price_rappen) / 100,
        })),
      });
      setInvoiceOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rechnungsentwurf konnte nicht geladen werden.');
    }
  }

  async function invoiceAction(invoice: Invoice, action: 'download' | 'mark_paid' | 'cancel') {
    try {
      if (action === 'download') {
        const response = await fetch(`/api/hive/invoices/${invoice.id}/action`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error?.error || 'PDF konnte nicht geladen werden.');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${invoice.invoice_number}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }
      await requestJson(`/api/hive/invoices/${invoice.id}/action`, {
        method: 'POST', body: JSON.stringify({ action }),
      });
      setNotice(action === 'mark_paid' ? 'Rechnung als bezahlt markiert.' : 'Rechnung storniert.');
      if (activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rechnungsaktion fehlgeschlagen.');
    }
  }

  async function deleteInvoice(invoice: Invoice) {
    if (!confirm(`${invoice.invoice_number} wirklich löschen?`)) return;
    try {
      await requestJson(`/api/hive/invoices/${invoice.id}`, { method: 'DELETE' });
      setNotice('Rechnungsentwurf gelöscht.');
      if (activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rechnung konnte nicht gelöscht werden.');
    }
  }

  async function offerAction(offer: Offer, action: 'share' | 'withdraw' | 'delete') {
    if (action === 'delete' && !confirm(`${offer.offer_number} wirklich löschen?`)) return;
    try {
      await requestJson(`/api/hive/offers/${offer.id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setNotice(
        action === 'share' ? 'Offerte im Kundenportal freigegeben. Keine E-Mail wurde versendet.'
        : action === 'withdraw' ? 'Offerte zurückgezogen.'
        : 'Offertenentwurf gelöscht.',
      );
      if (activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Offertenaktion fehlgeschlagen.');
    }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      const payload = {
        workspaceId:activeWorkspaceId,
        name:productDraft.name,
        description:productDraft.description,
        sku:productDraft.sku,
        unitPriceRappen:Math.round(productDraft.unitPrice * 100),
        taxRate:productDraft.taxRate,
        active:productDraft.active,
      };
      if (productDraft.id) {
        await requestJson(`/api/hive/products/${productDraft.id}`, {
          method:'PATCH',
          body:JSON.stringify(payload),
        });
      } else {
        await requestJson('/api/hive/products', {
          method:'POST',
          body:JSON.stringify(payload),
        });
      }
      setProductOpen(false);
      setNotice(productDraft.id ? 'Leistung aktualisiert.' : 'Leistung erstellt.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Leistung konnte nicht gespeichert werden.');
    }
  }

  async function deleteProduct(product: Product) {
    if (!activeWorkspaceId || !confirm(`${product.name} wirklich löschen?`)) return;
    try {
      await requestJson(`/api/hive/products/${product.id}?workspace=${encodeURIComponent(activeWorkspaceId)}`, { method:'DELETE' });
      setNotice('Leistung gelöscht.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Leistung konnte nicht gelöscht werden.');
    }
  }

  function openProduct(product?: Product) {
    setProductDraft(product ? {
      id:product.id,
      name:product.name,
      description:product.description || '',
      sku:product.sku || '',
      unitPrice:product.unit_price_rappen / 100,
      taxRate:Number(product.tax_rate || 0),
      active:product.active,
    } : { id:'', name:'', description:'', sku:'', unitPrice:0, taxRate:Number(settings?.default_tax_rate || 0), active:true });
    setProductOpen(true);
  }

  function addProductToInvoice(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setInvoiceDraft({
      ...invoiceDraft,
      taxRate:Number(product.tax_rate || invoiceDraft.taxRate),
      lines:[...invoiceDraft.lines, { description:product.name, quantity:1, unitPrice:product.unit_price_rappen / 100 }],
    });
  }

  function addProductToOffer(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setOfferDraft({
      ...offerDraft,
      taxRate:Number(product.tax_rate || offerDraft.taxRate),
      lines:[...offerDraft.lines, { description:product.name, quantity:1, unitPrice:product.unit_price_rappen / 100 }],
    });
  }

  async function createOffer(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      await requestJson('/api/hive/offers', {
        method: 'POST',
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          customerId: offerDraft.customerId,
          projectId: offerDraft.projectId || null,
          title: offerDraft.title,
          issueDate: offerDraft.issueDate,
          validUntil: offerDraft.validUntil,
          taxRate: offerDraft.taxRate,
          notes: offerDraft.notes,
          terms: offerDraft.terms,
          items: offerDraft.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitPriceRappen: Math.round(line.unitPrice * 100),
          })),
        }),
      });
      setOfferOpen(false);
      setNotice('Offertenentwurf erstellt.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Offerte konnte nicht erstellt werden.');
    }
  }

  async function portalAction(payload: Record<string, unknown>, successMessage: string) {
    if (!activeWorkspaceId) return;
    try {
      await requestJson('/api/hive/portal', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: activeWorkspaceId, ...payload }),
      });
      setNotice(successMessage);
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Portal-Aktion fehlgeschlagen.');
    }
  }

  async function createPortalInvite(event: FormEvent) {
    event.preventDefault();
    await portalAction(
      { action: 'create_invite', customerId: inviteDraft.customerId, email: inviteDraft.email },
      'Dev-Einladung angelegt. Es wurde keine E-Mail versendet.',
    );
    setInviteOpen(false);
  }

  async function uploadPortalFile(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId || !fileDraft.file) {
      setNotice('Bitte zuerst eine Datei auswählen.');
      return;
    }
    try {
      const common = {
        workspaceId: activeWorkspaceId,
        customerId: fileDraft.customerId,
        projectId: fileDraft.projectId || null,
        title: fileDraft.title || fileDraft.file.name,
        filename: fileDraft.file.name,
        mimeType: fileDraft.file.type || 'application/octet-stream',
        bytes: fileDraft.file.size,
        kind: fileDraft.kind,
      };
      const prepared = await requestJson<{ bucket:string; storagePath:string; token:string }>('/api/hive/files', {
        method:'POST',
        body:JSON.stringify({ action:'prepare_upload', ...common }),
      });

      const supabase = createPublicSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(prepared.bucket)
        .uploadToSignedUrl(prepared.storagePath, prepared.token, fileDraft.file);
      if (uploadError) throw uploadError;

      await requestJson('/api/hive/files', {
        method:'POST',
        body:JSON.stringify({ action:'complete_upload', storagePath:prepared.storagePath, ...common }),
      });
      setFileOpen(false);
      setFileDraft({ customerId:'', projectId:'', title:'', kind:'document', file:null });
      setNotice('Datei hochgeladen. Sie ist noch nicht im Kundenportal veröffentlicht.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Datei konnte nicht hochgeladen werden.');
    }
  }

  async function downloadPortalFile(file: PortalFile) {
    try {
      const data = await requestJson<{ signedUrl:string }>(`/api/hive/files/${file.id}`);
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Download fehlgeschlagen.');
    }
  }

  async function togglePortalFile(file: PortalFile) {
    if (!activeWorkspaceId) return;
    try {
      await requestJson(`/api/hive/files/${file.id}`, {
        method:'PATCH',
        body:JSON.stringify({
          workspaceId:activeWorkspaceId,
          published:!file.published_at,
          downloadEnabled:true,
        }),
      });
      setNotice(file.published_at ? 'Datei aus dem Portal genommen.' : 'Datei im Portal veröffentlicht.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Datei konnte nicht aktualisiert werden.');
    }
  }

  async function deletePortalFile(file: PortalFile) {
    if (!activeWorkspaceId || !confirm(`${file.title} wirklich löschen?`)) return;
    try {
      await requestJson(`/api/hive/files/${file.id}`, { method:'DELETE' });
      setNotice('Datei gelöscht.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Datei konnte nicht gelöscht werden.');
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId || !settings) return;
    try {
      const data = await requestJson<{ settings: Settings }>('/api/hive/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          businessName: settings.business_name,
          legalName: settings.legal_name,
          contactName: settings.contact_name,
          email: settings.email,
          phone: settings.phone,
          websiteUrl: settings.website_url,
          addressLine1: settings.address_line1,
          postalCode: settings.postal_code,
          city: settings.city,
          country: settings.country,
          logoUrl: settings.logo_url,
          primaryColor: settings.primary_color,
          secondaryColor: settings.secondary_color,
          accentColor: settings.accent_color,
          invoiceSenderName: settings.invoice_sender_name,
          iban: settings.iban,
          bankName: settings.bank_name,
          accountHolder: settings.account_holder,
          uidNumber: settings.uid_number,
          vatNumber: settings.vat_number,
          vatEnabled: settings.vat_enabled,
          defaultTaxRate: Number(settings.default_tax_rate),
          defaultDueDays: Number(settings.default_due_days),
          currency: settings.currency,
          invoicePrefix: settings.invoice_prefix,
        }),
      });
      setSettings(data.settings);
      setNotice('Business-Einstellungen gespeichert.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden.');
    }
  }

  const openCustomer = (customer?: Customer) => {
    setCustomerDraft(customer ? {
      id: customer.id, company: customer.company || '', contactName: customer.contact_name || '',
      email: customer.email || '', phone: customer.phone || '', addressLine1: customer.address_line1 || '',
      postalCode: customer.postal_code || '', city: customer.city || '', country: customer.country || 'Schweiz',
      notes: customer.notes || '',
    } : {
      id: '', company: '', contactName: '', email: '', phone: '', addressLine1: '',
      postalCode: '', city: '', country: 'Schweiz', notes: '',
    });
    setCustomerOpen(true);
  };

  const openProject = (project?: Project) => {
    setProjectDraft(project ? {
      id: project.id, customerId: project.customer_id, title: project.title,
      description: project.description || '', status: project.status,
      budget: project.budget_rappen / 100, startDate: project.start_date || '', dueDate: project.due_date || '',
    } : {
      id: '', customerId: customers[0]?.id || '', title: '', description: '', status: 'planning',
      budget: 0, startDate: '', dueDate: '',
    });
    setProjectOpen(true);
  };

  if (backendError && !workspaces.length) {
    return <main className="auth-shell" style={{ gridTemplateColumns: '1fr' }}>
      <section className="auth-panel">
        <div className="auth-setup">
          <span>HIVE BACKEND</span>
          <h2>Backend vorbereitet.</h2>
          <p>{backendError}</p>
          <p>Die Datenbank und Dev-Kopien sind verbunden. Für den Zugriff fehlt noch die aktivierte Clerk-Session.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <a href="/login">Zum Login</a>
            <button className="hsv-outline" onClick={() => void loadWorkspaces()}><RefreshCw size={14}/> Erneut prüfen</button>
          </div>
        </div>
      </section>
    </main>;
  }

  const nav = [
    ['overview', 'Überblick', LayoutDashboard],
    ['customers', 'Kunden', Users],
    ['projects', 'Projekte', BriefcaseBusiness],
    ['invoices', 'Rechnungen', CreditCard],
    ['offers', 'Offerten', FileText],
    ['catalog', 'Leistungen', Package],
    ['emails', 'E-Mail', Mail],
    ['portal', 'Portal', ShieldCheck],
    ['branding', 'Business', Settings2],
  ] as const;

  return <div className="hsv" style={{ '--business-accent': accent } as React.CSSProperties}>
    <header className="hsv-top">
      <div className="hsv-identity">
        <a className="hsv-hive" href="/">hive.</a><span className="hsv-divider"/>
        <span className="hsv-logo">{settings?.logo_url ? <img src={settings.logo_url} alt="Business Logo"/> : businessName.charAt(0)}</span>
        <select aria-label="Business auswählen" value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </div>
      <span className="hsv-mode">DEV DATABASE · E-MAIL-VERSAND GESPERRT</span>
      <a className="hsv-back" href="/account">Account <ArrowRight size={15}/></a>
    </header>

    <div className="hsv-layout">
      <nav className="hsv-nav" aria-label="Business-Module">
        {nav.map(([id, label, Icon]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Icon size={17}/>{label}</button>)}
      </nav>

      <main className="hsv-main">
        <div className="hsv-heading">
          <span>HIVE / {businessName.toUpperCase()}</span>
          <h1>{tab === 'overview' ? 'Dein Business.' : nav.find(([id]) => id === tab)?.[1] + '.'}</h1>
          <p>{busy ? 'Daten werden geladen…' : 'Echte Dev-Daten aus Supabase. Produktions-Workspaces bleiben gesperrt.'}</p>
        </div>

        {tab === 'overview' && <>
          <div className="hsv-cards">
            <button onClick={() => setTab('customers')}><span>KUNDEN</span><strong>{customers.length.toString().padStart(2, '0')}</strong><small>Öffnen <ArrowRight size={14}/></small></button>
            <button onClick={() => setTab('projects')}><span>PROJEKTE</span><strong>{projects.length.toString().padStart(2, '0')}</strong><small>Öffnen <ArrowRight size={14}/></small></button>
            <button onClick={() => setTab('invoices')}><span>RECHNUNGEN</span><strong>{invoices.length.toString().padStart(2, '0')}</strong><small>Öffnen <ArrowRight size={14}/></small></button>
            <button onClick={() => setTab('offers')}><span>OFFERTEN</span><strong>{offers.length.toString().padStart(2, '0')}</strong><small>Öffnen <ArrowRight size={14}/></small></button>
          </div>
          <div className="hsv-intro">
            <span className="hsv-big-logo">{settings?.logo_url ? <img src={settings.logo_url} alt="Business Logo"/> : businessName.charAt(0)}</span>
            <div><span>ECHTER DEV-KONTEXT</span><h2>{businessName}</h2><p>Dieser Workspace enthält eine isolierte Kopie des bestehenden CRM-Kontexts. Änderungen hier betreffen nicht die freigegebenen Live-Workspaces.</p><button onClick={() => setTab('branding')}>Business bearbeiten <ArrowRight size={15}/></button></div>
          </div>
        </>}

        {tab === 'customers' && <>
          <div className="hsv-rowtop"><strong>{customers.length} Kunden</strong><button className="hsv-primary" onClick={() => openCustomer()}><Plus size={15}/> Kunde hinzufügen</button></div>
          <div className="hsv-table">{customers.map((customer) => <div key={customer.id}>
            <span className="hsv-letter">{customerName(customer).charAt(0).toUpperCase()}</span>
            <span className="hsv-grow"><strong>{customerName(customer)}</strong><small>{customer.email || 'Dev-Kopie · E-Mail entfernt'} · {[customer.postal_code, customer.city].filter(Boolean).join(' ') || 'Keine Adresse'}</small></span>
            <button onClick={() => openCustomer(customer)}>Bearbeiten</button>
            <button aria-label="Kunde löschen" onClick={() => void deleteCustomer(customer)}><Trash2 size={16}/></button>
          </div>)}</div>
        </>}

        {tab === 'projects' && <>
          <div className="hsv-rowtop"><strong>{projects.length} Projekte</strong><button className="hsv-primary" disabled={!customers.length} onClick={() => openProject()}><Plus size={15}/> Projekt erstellen</button></div>
          <div className="hsv-table">{projects.map((project) => <div key={project.id}>
            <span className="hsv-letter"><BriefcaseBusiness size={16}/></span>
            <span className="hsv-grow"><strong>{project.title}</strong><small>{relatedName(project.customers)} · {project.status.replace('_', ' ')}</small></span>
            <strong>{money(project.budget_rappen)}</strong>
            <button onClick={() => void loadProjectWorkspace(project.id)}>Workspace</button>
            <button onClick={() => openProject(project)}>Bearbeiten</button>
            <button aria-label="Projekt löschen" onClick={() => void deleteProject(project)}><Trash2 size={16}/></button>
          </div>)}</div>
        </>}

        {tab === 'invoices' && <>
          <div className="hsv-rowtop"><strong>{invoices.length} Rechnungen</strong><button className="hsv-primary" disabled={!customers.length} onClick={() => {
            setInvoiceDraft({ id:'', customerId: customers[0]?.id || '', projectId: '', issueDate: today(), dueDate: afterDays(settings?.default_due_days || 30), taxRate: Number(settings?.default_tax_rate || 0), notes: '', lines: [{ description: '', quantity: 1, unitPrice: 0 }] });
            setInvoiceOpen(true);
          }}><Plus size={15}/> Rechnung erstellen</button></div>
          <div className="hsv-table">{invoices.map((invoice) => <div key={invoice.id}>
            <span className="hsv-letter"><CreditCard size={16}/></span>
            <span className="hsv-grow"><strong>{invoice.invoice_number}</strong><small>{relatedName(invoice.customers)} · {invoice.status}</small></span>
            <strong>{money(invoice.total_rappen, invoice.currency)}</strong>
            <button onClick={() => void invoiceAction(invoice, 'download')}>PDF</button>
            {invoice.status === 'draft' && !invoice.is_legacy && <button onClick={() => void openInvoiceDraft(invoice)}>Bearbeiten</button>}
            {invoice.status === 'draft' && !invoice.is_legacy && <button onClick={() => void deleteInvoice(invoice)}><Trash2 size={16}/></button>}
            {(invoice.status === 'sent' || invoice.status === 'overdue') && <button onClick={() => void invoiceAction(invoice, 'mark_paid')}>Bezahlt</button>}
            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && <button onClick={() => void invoiceAction(invoice, 'cancel')}>Stornieren</button>}
          </div>)}</div>
          <p className="hsv-warning">Der E-Mail-Versand ist in dieser Dev-Preview absichtlich serverseitig gesperrt.</p>
        </>}

        {tab === 'offers' && <>
          <div className="hsv-rowtop"><strong>{offers.length} Offerten</strong><button className="hsv-primary" disabled={!customers.length} onClick={() => {
            setOfferDraft({ customerId: customers[0]?.id || '', projectId: '', title: '', issueDate: today(), validUntil: afterDays(30), taxRate: Number(settings?.default_tax_rate || 0), notes: '', terms: 'Diese Offerte ist bis zum angegebenen Datum gültig.', lines: [{ description: '', quantity: 1, unitPrice: 0 }] });
            setOfferOpen(true);
          }}><Plus size={15}/> Offerte erstellen</button></div>
          <div className="hsv-table">{offers.map((offer) => <div key={offer.id}>
            <span className="hsv-letter"><FileText size={16}/></span>
            <span className="hsv-grow"><strong>{offer.offer_number} · {offer.title}</strong><small>{relatedName(offer.customers)} · {offer.status} · gültig bis {offer.valid_until}</small></span>
            <strong>{money(offer.total_rappen)}</strong>
            {offer.status === 'draft' && <button onClick={() => void offerAction(offer, 'share')}>Portal freigeben</button>}
            {offer.status === 'sent' && <button onClick={() => void offerAction(offer, 'withdraw')}>Zurückziehen</button>}
            {offer.status === 'draft' && <button aria-label="Offerte löschen" onClick={() => void offerAction(offer, 'delete')}><Trash2 size={16}/></button>}
          </div>)}</div>
        </>}

        {tab === 'catalog' && <>
          <div className="hsv-rowtop"><strong>{products.length} Leistungen</strong><button className="hsv-primary" onClick={() => openProduct()}><Plus size={15}/> Leistung erstellen</button></div>
          <div className="hsv-table">{products.map((product) => <div key={product.id}>
            <span className="hsv-letter"><Package size={16}/></span>
            <span className="hsv-grow"><strong>{product.name}</strong><small>{product.sku || 'Ohne SKU'} · {product.active ? 'aktiv' : 'inaktiv'} · {Number(product.tax_rate)}% Steuer</small></span>
            <strong>{money(product.unit_price_rappen)}</strong>
            <button onClick={() => openProduct(product)}>Bearbeiten</button>
            <button aria-label="Leistung löschen" onClick={() => void deleteProduct(product)}><Trash2 size={16}/></button>
          </div>)}</div>
        </>}

        {tab === 'emails' && <>
          <div className="hsv-rowtop"><strong>{emails.length} E-Mail-Ereignisse</strong><button className="hsv-outline" onClick={() => activeWorkspaceId && void loadWorkspaceData(activeWorkspaceId)}><RefreshCw size={14}/> Aktualisieren</button></div>
          <div className="hsv-table">{emails.map((email) => <div key={email.id}>
            <span className="hsv-letter"><Mail size={16}/></span>
            <span className="hsv-grow"><strong>{email.subject}</strong><small>{email.template_key} · {email.status} · {new Date(email.created_at).toLocaleString('de-CH')}</small></span>
            <small>{email.recipient_email}</small>
          </div>)}</div>
          <p className="hsv-warning">Historische Empfänger in der Dev-Kopie wurden neutralisiert.</p>
        </>}

        {tab === 'portal' && <>
          <div className="hsv-rowtop">
            <strong>{portal.memberships.length} Mitglieder · {portal.invites.length} Einladungen</strong>
            <button className="hsv-primary" disabled={!customers.length} onClick={() => {
              setInviteDraft({ customerId: customers[0]?.id || '', email: '' });
              setInviteOpen(true);
            }}><Plus size={15}/> Portal-Einladung</button>
          </div>

          <div className="hsv-intro" style={{ marginBottom: 18 }}>
            <span className="hsv-big-logo"><ShieldCheck size={26}/></span>
            <div><span>KUNDENPORTAL</span><h2>Zugänge & Freigaben</h2><p>Einladungen, Portal-Mitglieder, Dateien, Reviews und Kundenanfragen laufen pro Business und Department. Im Dev-Modus wird keine Einladung per E-Mail versendet.</p></div>
          </div>

          <div className="hsv-rowtop"><strong>Mitglieder</strong></div>
          <div className="hsv-table">{portal.memberships.length ? portal.memberships.map((member) => <div key={member.id}>
            <span className="hsv-letter"><Users size={16}/></span>
            <span className="hsv-grow"><strong>{customerName(customers.find((customer) => customer.id === member.customer_id))}</strong><small>{member.role} · {member.status}</small></span>
            {member.status === 'active' && <button onClick={() => void portalAction({ action:'revoke_membership', membershipId:member.id }, 'Portal-Zugang widerrufen.')}>Widerrufen</button>}
          </div>) : <p className="hsv-empty">Noch keine Portal-Mitglieder.</p>}</div>

          <div className="hsv-rowtop" style={{ marginTop: 24 }}><strong>Einladungen</strong></div>
          <div className="hsv-table">{portal.invites.length ? portal.invites.map((invite) => <div key={invite.id}>
            <span className="hsv-letter"><Mail size={16}/></span>
            <span className="hsv-grow"><strong>{invite.email}</strong><small>{customerName(customers.find((customer) => customer.id === invite.customer_id))} · gültig bis {new Date(invite.expires_at).toLocaleDateString('de-CH')}</small></span>
            {!invite.accepted_at && !invite.revoked_at && <button onClick={() => void portalAction({ action:'revoke_invite', inviteId:invite.id }, 'Einladung widerrufen.')}>Widerrufen</button>}
          </div>) : <p className="hsv-empty">Keine offenen Einladungen.</p>}</div>

          <div className="hsv-rowtop" style={{ marginTop: 24 }}><strong>Kundenanfragen</strong></div>
          <div className="hsv-table">{portal.requests.length ? portal.requests.map((item) => <div key={item.id}>
            <span className="hsv-letter"><Mail size={16}/></span>
            <span className="hsv-grow"><strong>{item.company || item.contact_name}</strong><small>{item.email} · {item.status} · {item.message || 'Keine Nachricht'}</small></span>
            {item.status === 'pending' && <><button onClick={() => void portalAction({ action:'request_update', requestId:item.id, status:'accepted' }, 'Anfrage akzeptiert.')}>Akzeptieren</button><button onClick={() => void portalAction({ action:'request_update', requestId:item.id, status:'declined' }, 'Anfrage abgelehnt.')}>Ablehnen</button></>}
          </div>) : <p className="hsv-empty">Keine Portal-Anfragen.</p>}</div>

          <div className="hsv-rowtop" style={{ marginTop: 24 }}><strong>Reviews</strong></div>
          <div className="hsv-table">{portal.reviews.length ? portal.reviews.map((review) => <div key={review.id}>
            <span className="hsv-letter"><FileText size={16}/></span>
            <span className="hsv-grow"><strong>{review.reviewer_name}</strong><small>{customerName(customers.find((customer) => customer.id === review.customer_id))} · {review.status} · {review.body}</small></span>
            {review.status === 'pending' && <><button onClick={() => void portalAction({ action:'review_update', reviewId:review.id, status:'approved' }, 'Review freigegeben.')}>Freigeben</button><button onClick={() => void portalAction({ action:'review_update', reviewId:review.id, status:'rejected' }, 'Review abgelehnt.')}>Ablehnen</button></>}
          </div>) : <p className="hsv-empty">Keine Reviews.</p>}</div>

          <div className="hsv-rowtop" style={{ marginTop: 24 }}>
            <strong>Dateien</strong>
            <button className="hsv-primary" disabled={!customers.length} onClick={() => {
              setFileDraft({ customerId:customers[0]?.id || '', projectId:'', title:'', kind:'document', file:null });
              setFileOpen(true);
            }}><Plus size={15}/> Datei hochladen</button>
          </div>
          <div className="hsv-table">{portal.files.length ? portal.files.map((file) => <div key={file.id}>
            <span className="hsv-letter"><FileText size={16}/></span>
            <span className="hsv-grow"><strong>{file.title}</strong><small>{file.original_filename} · {file.kind} · {file.published_at ? 'veröffentlicht' : 'Entwurf'}{file.bytes ? ` · ${(file.bytes / 1024 / 1024).toFixed(1)} MB` : ''}</small></span>
            <button onClick={() => void downloadPortalFile(file)}>Download</button>
            <button onClick={() => void togglePortalFile(file)}>{file.published_at ? 'Unpublish' : 'Publish'}</button>
            <button aria-label="Datei löschen" onClick={() => void deletePortalFile(file)}><Trash2 size={16}/></button>
          </div>) : <p className="hsv-empty">Keine Portal-Dateien.</p>}</div>

          <div className="hsv-rowtop" style={{ marginTop: 24 }}><strong>Letzte Aktivität</strong></div>
          <div className="hsv-table">{portal.activity.slice(0, 20).map((item) => <div key={item.id}>
            <span className="hsv-letter"><RefreshCw size={15}/></span>
            <span className="hsv-grow"><strong>{item.summary}</strong><small>{item.event_type} · {new Date(item.created_at).toLocaleString('de-CH')}</small></span>
          </div>)}</div>
        </>}

        {tab === 'branding' && settings && <form className="hsv-branding" onSubmit={saveSettings}>
          <div className="hsv-brand-preview"><span>{settings.logo_url ? <img src={settings.logo_url} alt="Logo"/> : settings.business_name.charAt(0)}</span><div><strong>{settings.business_name}</strong><small>{activeWorkspace?.role} · Dev-Workspace</small></div></div>
          <label>Business-Name<input value={settings.business_name} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}/></label>
          <label>Logo-URL<input value={settings.logo_url} onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })} placeholder="https://…"/></label>
          <label>Kontakt-E-Mail<input type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })}/></label>
          <label>Adresse<input value={settings.address_line1} onChange={(e) => setSettings({ ...settings, address_line1: e.target.value })}/></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <label>PLZ<input value={settings.postal_code} onChange={(e) => setSettings({ ...settings, postal_code: e.target.value })}/></label>
            <label>Ort<input value={settings.city} onChange={(e) => setSettings({ ...settings, city: e.target.value })}/></label>
          </div>
          <label>IBAN<input value={settings.iban} onChange={(e) => setSettings({ ...settings, iban: e.target.value })}/></label>
          <label>Rechnungspräfix<input value={settings.invoice_prefix} onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value.toUpperCase() })}/></label>
          <label>Standard-Steuersatz %<input type="number" min="0" max="100" step="0.1" value={settings.default_tax_rate} onChange={(e) => setSettings({ ...settings, default_tax_rate: Number(e.target.value) })}/></label>
          <label>Accent-Farbe<div className="hsv-color"><input type="color" value={settings.accent_color} onChange={(e) => setSettings({ ...settings, accent_color: e.target.value })}/><span>{settings.accent_color}</span></div></label>
          <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
        </form>}
      </main>
    </div>

    {notice && <div className="hsv-toast" role="status">{notice}<button aria-label="Schliessen" onClick={() => setNotice('')}><X size={16}/></button></div>}

    {fileOpen && <Modal title="Datei hochladen" onClose={() => setFileOpen(false)}>
      <form onSubmit={uploadPortalFile}>
        <label>Kunde<select required value={fileDraft.customerId} onChange={(e) => setFileDraft({ ...fileDraft, customerId:e.target.value, projectId:'' })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>Projekt<select value={fileDraft.projectId} onChange={(e) => setFileDraft({ ...fileDraft, projectId:e.target.value })}><option value="">Kein Projekt</option>{projects.filter((project) => project.customer_id === fileDraft.customerId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <label>Titel<input value={fileDraft.title} onChange={(e) => setFileDraft({ ...fileDraft, title:e.target.value })} placeholder="z.B. Final Photos"/></label>
        <label>Typ<select value={fileDraft.kind} onChange={(e) => setFileDraft({ ...fileDraft, kind:e.target.value as typeof fileDraft.kind })}><option value="document">Dokument</option><option value="image">Bild</option><option value="video">Video</option><option value="gallery">Galerie</option><option value="offer">Offerte</option></select></label>
        <label>Datei<input required type="file" onChange={(e) => setFileDraft({ ...fileDraft, file:e.target.files?.[0] || null })}/></label>
        <p className="hsv-warning">Max. 50 MB pro Datei. Nach dem Upload bleibt sie zuerst unveröffentlicht.</p>
        <button className="hsv-primary" type="submit">Hochladen <Check size={15}/></button>
      </form>
    </Modal>}

    {productOpen && <Modal title={productDraft.id ? 'Leistung bearbeiten' : 'Neue Leistung'} onClose={() => setProductOpen(false)}>
      <form onSubmit={saveProduct}>
        <label>Name<input required value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name:e.target.value })} placeholder="z.B. Event Video"/></label>
        <label>Beschreibung<textarea rows={3} value={productDraft.description} onChange={(e) => setProductDraft({ ...productDraft, description:e.target.value })}/></label>
        <label>SKU<input value={productDraft.sku} onChange={(e) => setProductDraft({ ...productDraft, sku:e.target.value })} placeholder="VIDEO-EVENT"/></label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <label>Preis CHF<input required type="number" min="0" step="0.01" value={productDraft.unitPrice} onChange={(e) => setProductDraft({ ...productDraft, unitPrice:Number(e.target.value) })}/></label>
          <label>Steuersatz %<input type="number" min="0" max="100" step="0.1" value={productDraft.taxRate} onChange={(e) => setProductDraft({ ...productDraft, taxRate:Number(e.target.value) })}/></label>
        </div>
        <label><input type="checkbox" checked={productDraft.active} onChange={(e) => setProductDraft({ ...productDraft, active:e.target.checked })}/> Aktiv</label>
        <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
      </form>
    </Modal>}

    {projectWorkspaceOpen && projectWorkspace && <div className="hsv-overlay">
      <div className="hsv-invoice-editor">
        <div className="hsv-editorbar">
          <div><small>PROJECT WORKSPACE</small><strong>{projectWorkspace.project.title}</strong></div>
          <button className="hsv-icon" onClick={() => setProjectWorkspaceOpen(false)} aria-label="Schliessen"><X size={18}/></button>
        </div>
        <div className="hsv-paper" style={{ maxWidth: 1050 }}>
          <div className="hsv-cards" style={{ gridTemplateColumns:'repeat(3,minmax(0,1fr))' }}>
            <button type="button"><span>TASKS</span><strong>{projectWorkspace.tasks.length.toString().padStart(2,'0')}</strong><small>{projectWorkspace.tasks.filter((task) => task.status === 'done').length} erledigt</small></button>
            <button type="button"><span>DELIVERABLES</span><strong>{projectWorkspace.deliverables.length.toString().padStart(2,'0')}</strong><small>{projectWorkspace.deliverables.filter((item) => item.status === 'delivered').length} geliefert</small></button>
            <button type="button"><span>BUDGET</span><strong style={{fontSize:24}}>{money(projectWorkspace.project.budget_rappen)}</strong><small>{projectWorkspace.project.status}</small></button>
          </div>

          <div className="hsv-rowtop" style={{marginTop:28}}><strong>Tasks</strong></div>
          <div className="hsv-table">{projectWorkspace.tasks.map((task) => <div key={task.id}>
            <button className="hsv-letter" onClick={() => void projectWorkspaceAction({
              action:'update_task',
              taskId:task.id,
              status:task.status === 'done' ? 'todo' : 'done',
            }, task.status === 'done' ? 'Task wieder geöffnet.' : 'Task erledigt.')}>{task.status === 'done' ? <Check size={16}/> : '•'}</button>
            <span className="hsv-grow"><strong>{task.title}</strong><small>{task.priority} · {task.status.replace('_',' ')}{task.due_date ? ` · fällig ${task.due_date}` : ''}</small></span>
            {task.status !== 'done' && <button onClick={() => void projectWorkspaceAction({ action:'update_task', taskId:task.id, status: task.status === 'in_progress' ? 'blocked' : 'in_progress' }, 'Task-Status aktualisiert.')}>{task.status === 'in_progress' ? 'Blockieren' : 'Starten'}</button>}
            <button onClick={() => void projectWorkspaceAction({ action:'delete_task', taskId:task.id }, 'Task gelöscht.')}><Trash2 size={15}/></button>
          </div>)}</div>
          <form onSubmit={createProjectTask} className="hsv-branding" style={{marginTop:16}}>
            <label>Neuer Task<input required value={taskDraft.title} onChange={(e) => setTaskDraft({ ...taskDraft, title:e.target.value })} placeholder="z.B. Final Cut exportieren"/></label>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <label>Priorität<select value={taskDraft.priority} onChange={(e) => setTaskDraft({ ...taskDraft, priority:e.target.value as ProjectTask['priority'] })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
              <label>Fällig<input type="date" value={taskDraft.dueDate} onChange={(e) => setTaskDraft({ ...taskDraft, dueDate:e.target.value })}/></label>
            </div>
            <button className="hsv-primary" type="submit"><Plus size={15}/> Task</button>
          </form>

          <div className="hsv-rowtop" style={{marginTop:34}}><strong>Deliverables</strong></div>
          <div className="hsv-table">{projectWorkspace.deliverables.map((item) => <div key={item.id}>
            <span className="hsv-letter"><FileText size={15}/></span>
            <span className="hsv-grow"><strong>{item.title}</strong><small>{item.status.replace('_',' ')}{item.due_date ? ` · fällig ${item.due_date}` : ''}{item.file_id ? ' · Datei verknüpft' : ''}</small></span>
            <button onClick={() => void projectWorkspaceAction({
              action:'update_deliverable',
              deliverableId:item.id,
              status:item.status === 'planned' ? 'in_progress' : item.status === 'in_progress' ? 'review' : item.status === 'review' ? 'approved' : item.status === 'approved' ? 'delivered' : 'delivered',
            }, 'Deliverable aktualisiert.')}>{item.status === 'delivered' ? 'Geliefert' : 'Weiter'}</button>
            <button onClick={() => void projectWorkspaceAction({ action:'delete_deliverable', deliverableId:item.id }, 'Deliverable gelöscht.')}><Trash2 size={15}/></button>
          </div>)}</div>
          <form onSubmit={createProjectDeliverable} className="hsv-branding" style={{marginTop:16}}>
            <label>Neues Deliverable<input required value={deliverableDraft.title} onChange={(e) => setDeliverableDraft({ ...deliverableDraft, title:e.target.value })} placeholder="z.B. Final Campaign Video"/></label>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <label>Fällig<input type="date" value={deliverableDraft.dueDate} onChange={(e) => setDeliverableDraft({ ...deliverableDraft, dueDate:e.target.value })}/></label>
              <label>Datei<select value={deliverableDraft.fileId} onChange={(e) => setDeliverableDraft({ ...deliverableDraft, fileId:e.target.value })}><option value="">Noch keine</option>{projectWorkspace.files.map((file) => <option key={file.id} value={file.id}>{file.title}</option>)}</select></label>
            </div>
            <button className="hsv-primary" type="submit"><Plus size={15}/> Deliverable</button>
          </form>
        </div>
      </div>
    </div>}

    {inviteOpen && <Modal title="Portal-Einladung" onClose={() => setInviteOpen(false)}>
      <form onSubmit={createPortalInvite}>
        <label>Kunde<select required value={inviteDraft.customerId} onChange={(e) => setInviteDraft({ ...inviteDraft, customerId:e.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>E-Mail<input required type="email" value={inviteDraft.email} onChange={(e) => setInviteDraft({ ...inviteDraft, email:e.target.value })} placeholder="test@example.com"/></label>
        <p className="hsv-warning">Dev-Modus: Die Einladung wird gespeichert, aber nicht versendet.</p>
        <button className="hsv-primary" type="submit">Einladung anlegen <Check size={15}/></button>
      </form>
    </Modal>}

    {customerOpen && <Modal title={customerDraft.id ? 'Kunde bearbeiten' : 'Neuer Kunde'} onClose={() => setCustomerOpen(false)}>
      <form onSubmit={saveCustomer}>
        <label>Firma<input value={customerDraft.company} onChange={(e) => setCustomerDraft({ ...customerDraft, company: e.target.value })}/></label>
        <label>Kontaktperson<input value={customerDraft.contactName} onChange={(e) => setCustomerDraft({ ...customerDraft, contactName: e.target.value })}/></label>
        <label>E-Mail<input type="email" value={customerDraft.email} onChange={(e) => setCustomerDraft({ ...customerDraft, email: e.target.value })}/></label>
        <label>Telefon<input value={customerDraft.phone} onChange={(e) => setCustomerDraft({ ...customerDraft, phone: e.target.value })}/></label>
        <label>Adresse<input value={customerDraft.addressLine1} onChange={(e) => setCustomerDraft({ ...customerDraft, addressLine1: e.target.value })}/></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}><label>PLZ<input value={customerDraft.postalCode} onChange={(e) => setCustomerDraft({ ...customerDraft, postalCode: e.target.value })}/></label><label>Ort<input value={customerDraft.city} onChange={(e) => setCustomerDraft({ ...customerDraft, city: e.target.value })}/></label></div>
        <label>Notiz<textarea rows={3} value={customerDraft.notes} onChange={(e) => setCustomerDraft({ ...customerDraft, notes: e.target.value })}/></label>
        <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
      </form>
    </Modal>}

    {projectOpen && <Modal title={projectDraft.id ? 'Projekt bearbeiten' : 'Neues Projekt'} onClose={() => setProjectOpen(false)}>
      <form onSubmit={saveProject}>
        {!projectDraft.id && <label>Kunde<select required value={projectDraft.customerId} onChange={(e) => setProjectDraft({ ...projectDraft, customerId: e.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>}
        <label>Projektname<input required value={projectDraft.title} onChange={(e) => setProjectDraft({ ...projectDraft, title: e.target.value })}/></label>
        <label>Status<select value={projectDraft.status} onChange={(e) => setProjectDraft({ ...projectDraft, status: e.target.value as Project['status'] })}><option value="planning">Planung</option><option value="active">Aktiv</option><option value="on_hold">Pausiert</option><option value="completed">Abgeschlossen</option></select></label>
        <label>Budget CHF<input type="number" min="0" step="0.01" value={projectDraft.budget} onChange={(e) => setProjectDraft({ ...projectDraft, budget: Number(e.target.value) })}/></label>
        <label>Beschreibung<textarea rows={3} value={projectDraft.description} onChange={(e) => setProjectDraft({ ...projectDraft, description: e.target.value })}/></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label>Start<input type="date" value={projectDraft.startDate} onChange={(e) => setProjectDraft({ ...projectDraft, startDate: e.target.value })}/></label><label>Fällig<input type="date" value={projectDraft.dueDate} onChange={(e) => setProjectDraft({ ...projectDraft, dueDate: e.target.value })}/></label></div>
        <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
      </form>
    </Modal>}

    {invoiceOpen && <DocumentModal title={invoiceDraft.id ? 'Rechnung bearbeiten' : 'Rechnung erstellen'} lines={invoiceDraft.lines} total={invoiceTotal} taxRate={invoiceDraft.taxRate} onClose={() => setInvoiceOpen(false)}
      onAddLine={() => setInvoiceDraft({ ...invoiceDraft, lines: [...invoiceDraft.lines, { description: '', quantity: 1, unitPrice: 0 }] })}
      onLineChange={(index, line) => setInvoiceDraft({ ...invoiceDraft, lines: invoiceDraft.lines.map((current, i) => i === index ? line : current) })}
      onLineDelete={(index) => setInvoiceDraft({ ...invoiceDraft, lines: invoiceDraft.lines.filter((_, i) => i !== index) })}>
      <form onSubmit={createInvoice}>
        <label>Kunde<select required value={invoiceDraft.customerId} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, customerId: e.target.value, projectId: '' })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>Projekt<select value={invoiceDraft.projectId} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, projectId: e.target.value })}><option value="">Kein Projekt</option>{projects.filter((project) => project.customer_id === invoiceDraft.customerId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label>Datum<input required type="date" value={invoiceDraft.issueDate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, issueDate: e.target.value })}/></label><label>Fällig<input required type="date" value={invoiceDraft.dueDate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, dueDate: e.target.value })}/></label></div>
        <label>Steuersatz %<input type="number" min="0" max="100" step="0.1" value={invoiceDraft.taxRate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, taxRate: Number(e.target.value) })}/></label>
        {products.some((product) => product.active) && <label>Leistung hinzufügen<select defaultValue="" onChange={(e) => { if (e.target.value) addProductToInvoice(e.target.value); e.currentTarget.value=''; }}><option value="">Aus Katalog wählen…</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_rappen)}</option>)}</select></label>}
        <label>Notiz<textarea rows={2} value={invoiceDraft.notes} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, notes: e.target.value })}/></label>
        <button className="hsv-primary" type="submit">{invoiceDraft.id ? 'Änderungen speichern' : 'Rechnungsentwurf erstellen'} <Check size={15}/></button>
      </form>
    </DocumentModal>}

    {offerOpen && <DocumentModal title="Offerte erstellen" lines={offerDraft.lines} total={offerTotal} taxRate={offerDraft.taxRate} onClose={() => setOfferOpen(false)}
      onAddLine={() => setOfferDraft({ ...offerDraft, lines: [...offerDraft.lines, { description: '', quantity: 1, unitPrice: 0 }] })}
      onLineChange={(index, line) => setOfferDraft({ ...offerDraft, lines: offerDraft.lines.map((current, i) => i === index ? line : current) })}
      onLineDelete={(index) => setOfferDraft({ ...offerDraft, lines: offerDraft.lines.filter((_, i) => i !== index) })}>
      <form onSubmit={createOffer}>
        <label>Kunde<select required value={offerDraft.customerId} onChange={(e) => setOfferDraft({ ...offerDraft, customerId: e.target.value, projectId: '' })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>Projekt<select value={offerDraft.projectId} onChange={(e) => setOfferDraft({ ...offerDraft, projectId: e.target.value })}><option value="">Kein Projekt</option>{projects.filter((project) => project.customer_id === offerDraft.customerId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <label>Titel<input required value={offerDraft.title} onChange={(e) => setOfferDraft({ ...offerDraft, title: e.target.value })}/></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label>Datum<input type="date" value={offerDraft.issueDate} onChange={(e) => setOfferDraft({ ...offerDraft, issueDate: e.target.value })}/></label><label>Gültig bis<input type="date" value={offerDraft.validUntil} onChange={(e) => setOfferDraft({ ...offerDraft, validUntil: e.target.value })}/></label></div>
        <label>Steuersatz %<input type="number" min="0" max="100" step="0.1" value={offerDraft.taxRate} onChange={(e) => setOfferDraft({ ...offerDraft, taxRate: Number(e.target.value) })}/></label>
        {products.some((product) => product.active) && <label>Leistung hinzufügen<select defaultValue="" onChange={(e) => { if (e.target.value) addProductToOffer(e.target.value); e.currentTarget.value=''; }}><option value="">Aus Katalog wählen…</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_rappen)}</option>)}</select></label>}
        <label>Bedingungen<textarea required rows={3} value={offerDraft.terms} onChange={(e) => setOfferDraft({ ...offerDraft, terms: e.target.value })}/></label>
        <button className="hsv-primary" type="submit">Offertenentwurf erstellen <Check size={15}/></button>
      </form>
    </DocumentModal>}
  </div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="hsv-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="hsv-dialog">
      <button type="button" className="hsv-close" aria-label="Schliessen" onClick={onClose}><X size={18}/></button>
      <span>HIVE CRM</span><h2>{title}</h2>{children}
    </div>
  </div>;
}

function DocumentModal({
  title, lines, total, taxRate, onClose, onAddLine, onLineChange, onLineDelete, children,
}: {
  title: string; lines: LineDraft[]; total: number; taxRate: number; onClose: () => void;
  onAddLine: () => void; onLineChange: (index: number, line: LineDraft) => void;
  onLineDelete: (index: number) => void; children: React.ReactNode;
}) {
  const tax = Math.round(total * taxRate / 100);
  return <div className="hsv-overlay hsv-invoice-overlay">
    <div className="hsv-invoice-editor">
      <div className="hsv-editorbar"><div><small>HIVE / DEV</small><strong>{title}</strong></div><button className="hsv-icon" onClick={onClose} aria-label="Schliessen"><X size={18}/></button></div>
      <div className="hsv-paper" style={{ maxWidth: 850 }}>
        {children}
        <div className="hsv-lines" style={{ marginTop: 28 }}>
          <div className="hsv-lineheader"><span>Beschreibung</span><span>Menge</span><span>CHF / Einheit</span><span>Betrag</span><span/></div>
          {lines.map((line, index) => <div className="hsv-line" key={index}>
            <input required value={line.description} placeholder="Leistung" onChange={(e) => onLineChange(index, { ...line, description: e.target.value })}/>
            <input required type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => onLineChange(index, { ...line, quantity: Number(e.target.value) })}/>
            <input required type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => onLineChange(index, { ...line, unitPrice: Number(e.target.value) })}/>
            <strong>{money(Math.round(line.quantity * line.unitPrice * 100))}</strong>
            <button type="button" onClick={() => onLineDelete(index)}><Trash2 size={15}/></button>
          </div>)}
        </div>
        <button type="button" className="hsv-addline" onClick={onAddLine}><Plus size={15}/> Position hinzufügen</button>
        <div className="hsv-bill-total"><div><span>Zwischensumme</span><strong>{money(total)}</strong></div><div><span>Steuern</span><strong>{money(tax)}</strong></div><div className="hsv-grand"><span>Gesamt</span><strong>{money(total + tax)}</strong></div></div>
      </div>
    </div>
  </div>;
}
