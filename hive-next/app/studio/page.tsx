'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, Building2, Check, ChevronDown, Clock3, CreditCard, FileText,
  LayoutDashboard, Mail, Menu, Package, Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, Smartphone, Trash2, Users, X,
} from 'lucide-react';
import { createPublicSupabaseBrowserClient } from '@/lib/supabase/public-browser';
import ThemeToggle from '@/app/components/theme-toggle';
import WorkspaceOverview from './workspace-overview';
import { useWorkspaceView } from './workspace-view';
import WorkspaceNavigation from './workspace-navigation';
import {WorkspaceGlassDock,WorkspaceViewSwitch} from './workspace-glass';
import CustomerDirectory from './customer-directory';
import BusinessesOverview, { type BusinessOverviewItem } from './businesses-overview';
import ProjectBoard from './project-board';
import ProjectCalendar from './project-calendar';
import DocumentEditor from './document-editor';
import InstallGuide from './install-guide';
import BackupCard from './backup-card';
import { orderWorkspaces, preferredWorkspace, workspaceLabel } from '@/lib/hive/workspace-selection';
import './styles.css';

type Workspace = { id: string; name: string; slug: string; status: string; role: string };
type Customer = {
  id: string; workspace_id: string; company: string | null; contact_name: string | null;
  email: string | null; phone: string | null; address_line1: string | null;
  postal_code: string | null; city: string | null; country: string | null; notes: string | null;
};
type Department = {
  id:string; workspace_id:string; customer_id:string; name:string; code:string;
  contact_name:string; contact_email:string; contact_phone:string;
  is_default:boolean; active:boolean; created_at:string; updated_at:string;
};
type Project = {
  id: string; workspace_id: string; customer_id: string; department_id:string; title: string; description: string | null;
  status: 'planning' | 'active' | 'completed' | 'on_hold'; budget_rappen: number;
  start_date: string | null; due_date: string | null;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type Invoice = {
  id: string; workspace_id: string; customer_id: string; project_id: string | null; source_offer_id:string|null;
  invoice_number: string; issue_date: string; due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'; currency: string;
  tax_rate: number; subtotal_rappen: number; tax_rappen: number; total_rappen: number;
  sent_at: string | null; paid_at: string | null; is_legacy: boolean; number_finalized:boolean;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type Offer = {
  id: string; workspace_id: string; customer_id: string; project_id: string | null;
  offer_number: string; title: string; issue_date: string; valid_until: string; status: string;
  tax_rate: number; subtotal_rappen: number; tax_rappen: number; total_rappen: number; accepted_at: string | null;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type InvoiceHistoryEvent = {
  id:string; kind:string; recipient:string|null; details:Record<string,unknown>; created_at:string;
};
type InvoiceSendAttempt = {
  id:string; previous_status:string; state:'pending'|'sent'|'failed'; provider_id:string|null;
  created_at:string; completed_at:string|null;
};
type InvoiceDocumentAudit = {
  version:number; filename:string; sha256:string; bytes:number; created_at:string;
};

type OfferHistoryEvent = {
  id:string; kind:string; details:Record<string,unknown>; created_at:string;
};
type OfferSendAttempt = {
  id:string; state:'pending'|'sent'|'failed'; provider_id:string|null;
  created_at:string; completed_at:string|null;
};
type OfferHistoryInvoice = {
  id:string; invoice_number:string; status:string; number_finalized:boolean;
};

type EmailLog = {
  id: string; template_key: string; status: string; recipient_email: string;
  recipient_name: string; subject: string; error_message: string | null; created_at: string;
};
type EmailTemplateRow = {
  id?:string; template_key:'invoice_send'|'offer_send'|'portal_invite'|'invoice_reminder';
  subject_template:string; text_template:string; customized:boolean;
};
type Settings = {
  workspace_id: string; business_name: string; legal_name: string; contact_name: string; email: string;
  phone: string; website_url: string; address_line1: string; postal_code: string; city: string;
  country: string; logo_url: string; primary_color: string; secondary_color: string; accent_color: string;
  invoice_sender_name: string; iban: string; bank_name: string; account_holder: string;
  uid_number: string; vat_number: string; vat_enabled: boolean; default_tax_rate: number;
  default_due_days: number; currency: string; invoice_prefix: string;
  invoice_reminders_enabled:boolean; invoice_reminder_days:number;
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
type TeamMember = {
  membership_id:string; user_id:string; role:'owner'|'admin'|'member'|'accountant';
  email:string; display_name:string; created_at:string;
};
type TeamInvite = {
  invite_id:string; email:string; role:'admin'|'member'|'accountant';
  expires_at:string; accepted_at:string|null; revoked_at:string|null; created_at:string;
};
type UnifiedActivity = {
  id:string; source:'activity'|'invoice'|'offer'|'email'; kind:string;
  entityType:string; entityId:string|null; summary:string; meta:string; createdAt:string;
};
type CustomerWorkspaceData = {
  customer: Customer & { created_at?:string; updated_at?:string };
  departments:Array<{id:string;name:string;code:string;contact_name:string;contact_email:string;is_default:boolean;active:boolean}>;
  projects:Array<{id:string;title:string;status:string;budget_rappen:number;department_id:string;due_date:string|null}>;
  invoices:Array<{id:string;invoice_number:string;status:string;currency:string;total_rappen:number;due_date:string;number_finalized:boolean;is_legacy:boolean}>;
  offers:Array<{id:string;offer_number:string;title:string;status:string;total_rappen:number;valid_until:string}>;
  files:Array<{id:string;title:string;original_filename:string;kind:string;bytes:number|null;published_at:string|null}>;
  memberships:Array<{id:string;department_id:string;role:string;status:string;accepted_at:string|null}>;
  activity:Array<{id:string;event_type:string;entity_type:string;summary:string;visibility:string;created_at:string}>;
  metrics:{projectCount:number;activeProjectCount:number;paidRappen:number;openRappen:number;offerPipelineRappen:number;fileCount:number;portalMemberCount:number};
  canViewFinance:boolean;
};

type Tab = 'businesses' | 'overview' | 'customers' | 'projects' | 'invoices' | 'offers' | 'catalog' | 'emails' | 'portal' | 'activity' | 'team' | 'branding';
type EmailRecipient = {email:string;name:string;cc:string[]};
type SendConfirmation =
  | {kind:'invoice';item:Invoice;recipient:EmailRecipient;workspaceId:string}
  | {kind:'offer';item:Offer;recipient:EmailRecipient;workspaceId:string}
  | {kind:'portal';invite:{customerId:string;departmentId:string;email:string};recipient:EmailRecipient;workspaceId:string};

type LineDraft = { description: string; quantity: number; unitPrice: number };

const today = () => new Date().toISOString().slice(0, 10);
const afterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const money = (rappen: number, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format((Number(rappen) || 0) / 100);
const stateLabel:Record<string,string> = { planning:'Geplant', active:'In Arbeit', completed:'Abgeschlossen', on_hold:'Pausiert', draft:'Entwurf', sent:'Offen', paid:'Bezahlt', overdue:'Überfällig', cancelled:'Storniert', accepted:'Angenommen', withdrawn:'Zurückgezogen', expired:'Abgelaufen' };
const shortDate = (value:string) => value ? new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00')) : '—';
const customerName = (customer?: Partial<Customer> | null) =>
  customer?.company?.trim() || customer?.contact_name?.trim() || 'Ohne Name';
const relatedName = (relation?: { company?: string | null; contact_name?: string | null } | null) =>
  relation?.company?.trim() || relation?.contact_name?.trim() || 'Kunde';

const invoiceSendStorageKey = (invoiceId:string) => `hive.invoiceSendRequest.${invoiceId}`;
const offerSendStorageKey = (offerId:string) => `hive.offerSendRequest.${offerId}`;
const validRequestKey = (value:string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const canFinanceRole = (role?:string) => ['owner','admin','accountant'].includes(role || '');
const canAdminRole = (role?:string) => ['owner','admin'].includes(role || '');

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    signal: init?.signal ?? ((!init?.method || init.method === 'GET') ? AbortSignal.timeout(15000) : undefined),
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
  const [tab, setTab] = useWorkspaceView();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [listStatus, setListStatus] = useState('all');
  const [projectView, setProjectView] = useState<'list'|'board'|'calendar'>('list');
  const [projectViewReady, setProjectViewReady] = useState(false);
  useEffect(() => { setListQuery(''); setListStatus('all'); }, [tab]);
  useEffect(() => {
    let stored:string|null=null;
    try { stored=window.localStorage.getItem('hive.projectView.v1'); } catch { /* View selection works without browser storage. */ }
    if (stored === 'list' || stored === 'board' || stored === 'calendar') setProjectView(stored);
    setProjectViewReady(true);
  }, []);
  useEffect(() => {
    if (!projectViewReady) return;
    try { window.localStorage.setItem('hive.projectView.v1', projectView); } catch { /* The selected view remains usable for this session. */ }
  }, [projectView, projectViewReady]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [businessesOverview, setBusinessesOverview] = useState<BusinessOverviewItem[]>([]);
  const [businessesOverviewBusy, setBusinessesOverviewBusy] = useState(false);
  const [businessesOverviewError, setBusinessesOverviewError] = useState('');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const currentWorkspace = useRef(activeWorkspaceId);
  currentWorkspace.current = activeWorkspaceId;
  const workspaceRequest = useRef(0);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRow[]>([]);
  const [emailMobileView, setEmailMobileView] = useState<'templates'|'history'>('templates');
  const [portal, setPortal] = useState<PortalData>({ memberships:[], invites:[], requests:[], files:[], reviews:[], activity:[] });
  const [portalMobileView, setPortalMobileView] = useState<'access'|'files'|'requests'|'activity'>('access');
  const [settingsMobileView, setSettingsMobileView] = useState<'appearance'|'brand'|'contact'|'billing'|'data'>('appearance');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activityFeed, setActivityFeed] = useState<UnifiedActivity[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [teamInviteToken, setTeamInviteToken] = useState('');
  const [teamInviteExpiresAt, setTeamInviteExpiresAt] = useState('');
  const [busy, setBusy] = useState(true);
  const [identityReady, setIdentityReady] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [secondaryPending, setSecondaryPending] = useState(false);
  const [secondaryIssues, setSecondaryIssues] = useState<Record<string,string>>({});
  const [notice, setNotice] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [businessOpen, setBusinessOpen] = useState(false);
  const [businessDraft, setBusinessDraft] = useState({ name:'', invoicePrefix:'HIVE' });
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamDraft, setTeamDraft] = useState<{email:string;role:'admin'|'member'|'accountant'}>({ email:'', role:'member' });
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerWorkspaceOpen, setCustomerWorkspaceOpen] = useState(false);
  const [customerWorkspace, setCustomerWorkspace] = useState<CustomerWorkspaceData | null>(null);
  const [customerDraft, setCustomerDraft] = useState({
    id: '', company: '', contactName: '', email: '', phone: '',
    addressLine1: '', postalCode: '', city: '', country: 'Schweiz', notes: '',
  });
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [departmentCustomer, setDepartmentCustomer] = useState<Customer | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [scopeDepartments, setScopeDepartments] = useState<Department[]>([]);
  const [departmentDraft, setDepartmentDraft] = useState({
    id:'', name:'', code:'', contactName:'', contactEmail:'', contactPhone:'', isDefault:false, active:true,
  });
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectWorkspaceOpen, setProjectWorkspaceOpen] = useState(false);
  const [projectWorkspace, setProjectWorkspace] = useState<ProjectWorkspaceData | null>(null);
  const [projectWorkspaceId, setProjectWorkspaceId] = useState('');
  const [taskDraft, setTaskDraft] = useState({ title:'', description:'', priority:'normal' as ProjectTask['priority'], dueDate:'' });
  const [deliverableDraft, setDeliverableDraft] = useState({ title:'', description:'', dueDate:'', fileId:'' });
  const [projectDraft, setProjectDraft] = useState({
    id: '', customerId: '', departmentId:'', title: '', description: '', status: 'planning' as Project['status'],
    budget: 0, startDate: '', dueDate: '',
  });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceHistoryOpen, setInvoiceHistoryOpen] = useState(false);
  const [invoiceHistoryInvoice, setInvoiceHistoryInvoice] = useState<Invoice | null>(null);
  const [invoiceHistoryEvents, setInvoiceHistoryEvents] = useState<InvoiceHistoryEvent[]>([]);
  const [invoiceSendAttempts, setInvoiceSendAttempts] = useState<InvoiceSendAttempt[]>([]);
  const [invoiceDocumentAudit, setInvoiceDocumentAudit] = useState<InvoiceDocumentAudit | null>(null);
  const [invoiceHistoryBusy, setInvoiceHistoryBusy] = useState(false);
  const invoiceSendKeys = useRef(new Map<string,string>());
  const [invoiceSendBusyIds, setInvoiceSendBusyIds] = useState<Set<string>>(() => new Set());
  const [invoiceDraft, setInvoiceDraft] = useState({
    id: '', customerId: '', projectId: '', issueDate: today(), dueDate: afterDays(30),
    taxRate: 0, notes: '', lines: [{ description: '', quantity: 1, unitPrice: 0 }] as LineDraft[],
  });
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerHistoryOpen, setOfferHistoryOpen] = useState(false);
  const [offerHistoryOffer, setOfferHistoryOffer] = useState<Offer | null>(null);
  const [offerHistoryEvents, setOfferHistoryEvents] = useState<OfferHistoryEvent[]>([]);
  const [offerSendAttempts, setOfferSendAttempts] = useState<OfferSendAttempt[]>([]);
  const [offerHistoryInvoice, setOfferHistoryInvoice] = useState<OfferHistoryInvoice | null>(null);
  const [offerHistoryBusy, setOfferHistoryBusy] = useState(false);
  const offerSendKeys = useRef(new Map<string,string>());
  const [offerSendBusyIds, setOfferSendBusyIds] = useState<Set<string>>(() => new Set());
  const [productOpen, setProductOpen] = useState(false);
  const [productDraft, setProductDraft] = useState({ id:'', name:'', description:'', sku:'', unitPrice:0, taxRate:0, active:true });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState({ customerId:'', departmentId:'', email:'' });
  const [sendConfirmation, setSendConfirmation] = useState<SendConfirmation|null>(null);
  const [sendPreparing, setSendPreparing] = useState('');
  const [sendConfirmationBusy, setSendConfirmationBusy] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [fileDraft, setFileDraft] = useState<{ customerId:string; departmentId:string; projectId:string; title:string; kind:'image'|'video'|'gallery'|'offer'|'document'; file:File|null }>({
    customerId:'', departmentId:'', projectId:'', title:'', kind:'document', file:null,
  });
  const hasOpenOverlay =
    installOpen || mobileMenuOpen || quickCreateOpen || searchOpen || businessOpen || teamOpen ||
    customerOpen || customerWorkspaceOpen || departmentOpen || projectOpen ||
    projectWorkspaceOpen || invoiceOpen || invoiceHistoryOpen || offerOpen || offerHistoryOpen || productOpen || inviteOpen ||
    fileOpen || Boolean(sendConfirmation);

  useEffect(() => {
    const closeFullscreenWorkspace=(event:KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const modalOwnsEscape =
        installOpen || mobileMenuOpen || quickCreateOpen || searchOpen || businessOpen || teamOpen ||
        customerOpen || projectOpen || invoiceOpen || invoiceHistoryOpen || offerOpen || offerHistoryOpen || productOpen ||
        inviteOpen || fileOpen || Boolean(sendConfirmation);
      if (modalOwnsEscape) return;
      if (departmentOpen) setDepartmentOpen(false);
      else if (customerWorkspaceOpen) setCustomerWorkspaceOpen(false);
      else if (projectWorkspaceOpen) setProjectWorkspaceOpen(false);
    };
    window.addEventListener('keydown', closeFullscreenWorkspace);
    return () => window.removeEventListener('keydown', closeFullscreenWorkspace);
  }, [
    installOpen, mobileMenuOpen, quickCreateOpen, searchOpen, businessOpen, teamOpen,
    customerOpen, projectOpen, invoiceOpen, invoiceHistoryOpen, offerOpen, offerHistoryOpen, productOpen, inviteOpen,
    fileOpen, sendConfirmation, departmentOpen, customerWorkspaceOpen, projectWorkspaceOpen,
  ]);

  useEffect(() => {
    if (!hasOpenOverlay) return;
    const previousOverflow=document.body.style.overflow;
    const previousOverscroll=document.body.style.overscrollBehavior;
    document.body.style.overflow='hidden';
    document.body.style.overscrollBehavior='none';
    return () => {
      document.body.style.overflow=previousOverflow;
      document.body.style.overscrollBehavior=previousOverscroll;
    };
  }, [hasOpenOverlay]);

  const [offerDraft, setOfferDraft] = useState({
    id:'', customerId: '', projectId: '', title: '', issueDate: today(), validUntil: afterDays(30),
    taxRate: 0, notes: '', terms: 'Diese Offerte ist bis zum angegebenen Datum gültig.',
    lines: [{ description: '', quantity: 1, unitPrice: 0 }] as LineDraft[],
  });

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null;
  const canViewFinance = canFinanceRole(activeWorkspace?.role);
  const canAdmin = canAdminRole(activeWorkspace?.role);
  const businessName = (loadedWorkspaceId === activeWorkspaceId ? settings?.business_name : null) || activeWorkspace?.name || 'Hive';
  const accent = '#171717';

  const loadWorkspaces = useCallback(async () => {
    setBusy(true);
    setBackendError('');
    try {
      const data = await requestJson<{ workspaces: Workspace[] }>('/api/hive/workspaces');
      setWorkspaces(orderWorkspaces(data.workspaces));
      setActiveWorkspaceId((current) => {
        if (data.workspaces.some((workspace) => workspace.id === current)) return current;
        let stored = '';
        try { stored = window.localStorage.getItem('hive.activeWorkspace.v2') || ''; } catch { /* Browser storage may be disabled. */ }
        return preferredWorkspace(data.workspaces, current, stored);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend nicht erreichbar';
      setBackendError(message);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadBusinessesOverview = useCallback(async () => {
    setBusinessesOverviewBusy(true);
    setBusinessesOverviewError('');
    try {
      const data=await requestJson<{businesses:BusinessOverviewItem[]}>('/api/hive/businesses/overview');
      setBusinessesOverview(data.businesses);
    } catch (error) {
      setBusinessesOverviewError(error instanceof Error ? error.message : 'Businesses konnten nicht geladen werden.');
    } finally {
      setBusinessesOverviewBusy(false);
    }
  }, []);

  function switchWorkspace(workspaceId:string, nextTab:Tab='overview') {
    if (!workspaces.some((workspace)=>workspace.id===workspaceId)) return;
    if (workspaceId === currentWorkspace.current) { setTab(nextTab); return; }
    currentWorkspace.current = workspaceId;
    workspaceRequest.current += 1;
    setNotice(''); setListQuery(''); setListStatus('all');
    setBusy(true); setLoadedWorkspaceId(''); setSecondaryIssues({}); setSecondaryPending(false);
    setCustomers([]); setProjects([]); setInvoices([]); setOffers([]); setProducts([]);
    setEmails([]); setEmailTemplates([]); setActivityFeed([]); setTeamInvites([]);
    setPortal({memberships:[], invites:[], requests:[], files:[], reviews:[], activity:[]});
    setCustomerOpen(false); setProjectOpen(false); setInvoiceOpen(false); setInvoiceHistoryOpen(false);
    setOfferOpen(false); setOfferHistoryOpen(false); setQuickCreateOpen(false); setDepartmentOpen(false);
    setProjectWorkspaceOpen(false); setCustomerWorkspaceOpen(false); setProductOpen(false); setInviteOpen(false);
    setFileOpen(false); setTeamOpen(false); setSearchOpen(false); setSearchQuery(''); setTeamMembers([]);
    setScopeDepartments([]); setSettings(null); setSendConfirmation(null); setSendPreparing('');
    setActiveWorkspaceId(workspaceId);
    setTab(nextTab);
    window.scrollTo({top:0});
  }

  async function loadScopeDepartments(customerId:string) {
    if (!activeWorkspaceId || !customerId) {
      setScopeDepartments([]);
      return [] as Department[];
    }
    const data=await requestJson<{departments:Department[]}>(
      `/api/hive/customers/${customerId}/departments?workspace=${encodeURIComponent(activeWorkspaceId)}`,
    );
    const active=data.departments.filter((department) => department.active);
    setScopeDepartments(active);
    return active;
  }

  function preferredDepartmentId(items:Department[]) {
    return items.find((department) => department.is_default)?.id || items[0]?.id || '';
  }

  function portalInviteAddress(customerId:string, departmentId:string, items:Department[]) {
    const department=items.find((item) => item.id === departmentId);
    const customer=customers.find((item) => item.id === customerId);
    return (department?.contact_email || customer?.email || '').trim();
  }

  async function openPortalInvite() {
    const customerId=customers[0]?.id || '';
    const items=await loadScopeDepartments(customerId);
    const departmentId=preferredDepartmentId(items);
    setInviteDraft({ customerId, departmentId, email:portalInviteAddress(customerId, departmentId, items) });
    setInviteOpen(true);
  }

  async function openPortalFile() {
    const customerId=customers[0]?.id || '';
    const items=await loadScopeDepartments(customerId);
    setFileDraft({
      customerId,
      departmentId:preferredDepartmentId(items),
      projectId:'',
      title:'',
      kind:'document',
      file:null,
    });
    setFileOpen(true);
  }

  async function createBusiness(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await requestJson<{ workspace: Workspace }>('/api/hive/workspaces', {
        method:'POST',
        body:JSON.stringify(businessDraft),
      });
      setBusinessOpen(false);
      setBusinessDraft({ name:'', invoicePrefix:'HIVE' });
      setWorkspaces((current) => [...current.filter((item) => item.id !== data.workspace.id), data.workspace]);
      setActiveWorkspaceId(data.workspace.id);
      setNotice('Business erstellt.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Business konnte nicht erstellt werden.');
    }
  }

  function openNewInvoice() {
    if (!customers.length) {
      setNotice('Erstelle zuerst einen Kunden.');
      return;
    }
    setInvoiceDraft({
      id:'',
      customerId:customers[0]?.id || '',
      projectId:'',
      issueDate:today(),
      dueDate:afterDays(settings?.default_due_days || 30),
      taxRate:Number(settings?.default_tax_rate || 0),
      notes:'',
      lines:[{description:'',quantity:1,unitPrice:0}],
    });
    setInvoiceOpen(true);
  }

  function openNewOffer() {
    if (!customers.length) {
      setNotice('Erstelle zuerst einen Kunden.');
      return;
    }
    setOfferDraft({
      id:'',
      customerId:customers[0]?.id || '',
      projectId:'',
      title:'',
      issueDate:today(),
      validUntil:afterDays(30),
      taxRate:Number(settings?.default_tax_rate || 0),
      notes:'',
      terms:'Diese Offerte ist bis zum angegebenen Datum gültig.',
      lines:[{description:'',quantity:1,unitPrice:0}],
    });
    setOfferOpen(true);
  }

  function updateBusinessName(name:string) {
    const prefix=name.toUpperCase()
      .replace(/[^A-Z0-9]+/g,'')
      .slice(0,8) || 'HIVE';
    setBusinessDraft({ name, invoicePrefix:prefix });
  }

  const loadTeam = useCallback(async (workspaceId:string) => {
    if (!workspaceId) return;
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace || !['owner','admin'].includes(workspace.role)) {
      setTeamMembers([]);
      setTeamInvites([]);
      return;
    }
    try {
      const data = await requestJson<{members:TeamMember[];invites:TeamInvite[]}>(`/api/hive/team?workspace=${encodeURIComponent(workspaceId)}`);
      if (currentWorkspace.current !== workspaceId) return;
      setTeamMembers(data.members);
      setTeamInvites(data.invites || []);
    } catch (error) {
      if (currentWorkspace.current !== workspaceId) return;
      setNotice(error instanceof Error ? error.message : 'Team konnte nicht geladen werden.');
    }
  }, [workspaces]);

  async function inviteTeamMember(event:FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      const data=await requestJson<{inviteId:string;token:string;expiresAt:string}>('/api/hive/team', {
        method:'POST',
        body:JSON.stringify({ action:'invite', workspaceId:activeWorkspaceId, email:teamDraft.email, role:teamDraft.role }),
      });
      setTeamInviteToken(data.token);
      setTeamInviteExpiresAt(data.expiresAt);
      setNotice('Team-Einladung erstellt.');
      await loadTeam(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Team-Einladung konnte nicht erstellt werden.');
    }
  }

  async function revokeTeamInvite(invite:TeamInvite) {
    if (!activeWorkspaceId) return;
    try {
      await requestJson('/api/hive/team', {
        method:'POST',
        body:JSON.stringify({ action:'revoke_invite', workspaceId:activeWorkspaceId, inviteId:invite.invite_id }),
      });
      setNotice('Team-Einladung widerrufen.');
      await loadTeam(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Einladung konnte nicht widerrufen werden.');
    }
  }

  async function copyTeamInvite() {
    if (!teamInviteToken || !navigator.clipboard) return;
    const url=`${window.location.origin}/account?team_invite=${encodeURIComponent(teamInviteToken)}`;
    await navigator.clipboard.writeText(url);
    setNotice('Einladungslink kopiert.');
  }

  async function updateTeamRole(member:TeamMember, role:'admin'|'member'|'accountant') {
    if (!activeWorkspaceId) return;
    try {
      await requestJson('/api/hive/team', {
        method:'POST',
        body:JSON.stringify({ action:'role', workspaceId:activeWorkspaceId, userId:member.user_id, role }),
      });
      setNotice('Rolle aktualisiert.');
      await loadTeam(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rolle konnte nicht geändert werden.');
    }
  }

  async function removeTeamMember(member:TeamMember) {
    if (!activeWorkspaceId || !confirm(`${member.display_name || member.email} wirklich aus dem Team entfernen?`)) return;
    try {
      await requestJson('/api/hive/team', {
        method:'POST',
        body:JSON.stringify({ action:'remove', workspaceId:activeWorkspaceId, userId:member.user_id }),
      });
      setNotice('Teammitglied entfernt.');
      await loadTeam(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Teammitglied konnte nicht entfernt werden.');
    }
  }

  const loadWorkspaceData = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    const requestId = ++workspaceRequest.current;
    const workspace=workspaces.find((item)=>item.id===workspaceId);
    const finance=canFinanceRole(workspace?.role);
    const admin=canAdminRole(workspace?.role);
    setBusy(true);
    setBackendError('');
    try {
      const q = encodeURIComponent(workspaceId);
      setSecondaryPending(true);
      setSecondaryIssues({});
      const optional = async <T,>(module:string, task:Promise<T>, fallback:T) => {
        try { return { module, data:await task, error:'' }; }
        catch (error) { return { module, data:fallback, error:error instanceof Error ? error.message : 'Verbindung fehlgeschlagen' }; }
      };
      // Start together, but an integration outage must not block core CRM data.
      const extra = Promise.all([
        optional('emails', admin ? requestJson<{emails:EmailLog[]}>(`/api/hive/emails?workspace=${q}`) : Promise.resolve({emails:[]}), {emails:[] as EmailLog[]}),
        optional('emails', admin ? requestJson<{templates:EmailTemplateRow[]}>(`/api/hive/email-templates?workspace=${q}`) : Promise.resolve({templates:[]}), {templates:[] as EmailTemplateRow[]}),
        optional('portal', requestJson<PortalData>(`/api/hive/portal?workspace=${q}`), {memberships:[],invites:[],requests:[],files:[],reviews:[],activity:[]} as PortalData),
        optional('activity', requestJson<{activity:UnifiedActivity[]}>(`/api/hive/activity?workspace=${q}`), {activity:[] as UnifiedActivity[]}),
      ]);
      const [customerData, projectData, invoiceData, offerData, productData, settingsData] = await Promise.all([
        requestJson<{ customers: Customer[] }>(`/api/hive/customers?workspace=${q}`),
        requestJson<{ projects: Project[] }>(`/api/hive/projects?workspace=${q}`),
        finance ? requestJson<{ invoices: Invoice[] }>(`/api/hive/invoices?workspace=${q}`) : Promise.resolve({invoices:[] as Invoice[]}),
        finance ? requestJson<{ offers: Offer[] }>(`/api/hive/offers?workspace=${q}`) : Promise.resolve({offers:[] as Offer[]}),
        finance ? requestJson<{ products: Product[] }>(`/api/hive/products?workspace=${q}`) : Promise.resolve({products:[] as Product[]}),
        requestJson<{ settings: Settings }>(`/api/hive/settings?workspace=${q}`),
      ]);
      if (requestId !== workspaceRequest.current || currentWorkspace.current !== workspaceId) return;
      setLoadedWorkspaceId(workspaceId);
      setCustomers(customerData.customers);
      setProjects(projectData.projects);
      setInvoices(invoiceData.invoices);
      setOffers(offerData.offers);
      setProducts(productData.products);
      setSettings(settingsData.settings);
      setBusy(false);
      const [emailData, templateData, portalData, activityData] = await extra;
      if (requestId !== workspaceRequest.current || currentWorkspace.current !== workspaceId) return;
      setEmails(emailData.data.emails);
      setEmailTemplates(templateData.data.templates);
      setPortal(portalData.data);
      setActivityFeed(activityData.data.activity);
      const issues:Record<string,string>={};
      for (const result of [emailData, templateData, portalData, activityData]) if (result.error) issues[result.module]=result.error;
      setSecondaryIssues(issues);
      setSecondaryPending(false);
    } catch (error) {
      if (requestId !== workspaceRequest.current || currentWorkspace.current !== workspaceId) return;
      const message = error instanceof Error ? error.message : 'Workspace konnte nicht geladen werden';
      setBackendError(message);
    } finally {
      if (requestId === workspaceRequest.current && currentWorkspace.current === workspaceId) { setBusy(false); setSecondaryPending(false); }
    }
  }, [workspaces]);

  useEffect(() => {
    let active=true;
    void (async () => {
      try {
        const response=await fetch('/api/auth/identity-link',{cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Anmeldung konnte nicht geprüft werden.');
        if (data.provider === 'clerk' && data.linked === false) {
          window.location.replace('/account?link=required');
          return;
        }
        if (active) setIdentityReady(true);
      } catch (error) {
        if (!active) return;
        setBackendError(error instanceof Error ? error.message : 'Anmeldung konnte nicht geprüft werden.');
        setBusy(false);
      }
    })();
    return () => { active=false; };
  }, []);

  useEffect(() => {
    if (identityReady) void loadWorkspaces();
  }, [identityReady, loadWorkspaces]);
  useEffect(() => {
    if (!activeWorkspaceId || !workspaces.some((workspace)=>workspace.id===activeWorkspaceId)) return;
    try { window.localStorage.setItem('hive.activeWorkspace.v2', activeWorkspaceId); } catch { /* Switching still works without persistence. */ }
  }, [activeWorkspaceId, workspaces]);
  useEffect(() => { if (activeWorkspaceId) void loadWorkspaceData(activeWorkspaceId); }, [activeWorkspaceId, loadWorkspaceData]);
  useEffect(() => { if (tab === 'businesses') void loadBusinessesOverview(); }, [tab, loadBusinessesOverview]);
  useEffect(() => { if (tab === 'team' && activeWorkspaceId) void loadTeam(activeWorkspaceId); }, [tab, activeWorkspaceId, loadTeam]);
  useEffect(() => {
    if (!canAdmin && (portalMobileView === 'access' || portalMobileView === 'requests')) setPortalMobileView('files');
  }, [canAdmin, portalMobileView]);
  useEffect(() => {
    if (!activeWorkspace) return;
    const financeTabs:Tab[]=['invoices','offers','catalog'];
    const adminTabs:Tab[]=['emails','team','branding'];
    if ((!canViewFinance && financeTabs.includes(tab)) || (!canAdmin && adminTabs.includes(tab))) setTab('overview');
  }, [tab, canViewFinance, canAdmin, activeWorkspace, setTab]);
  useEffect(() => {
    const handler = (event:KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Keep the topmost sheet in focus and prevent the workspace scrolling behind it.
  useEffect(() => {
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]')).filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) focusable()[0]?.focus({preventScroll:true});
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dialog.querySelector<HTMLButtonElement>('button[aria-label="Schliessen"], button[aria-label="Suche schliessen"]')?.click();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); if (previous?.isConnected) previous.focus({preventScroll:true}); };
  }, [installOpen, mobileMenuOpen, quickCreateOpen, searchOpen, businessOpen, teamOpen, customerOpen, departmentOpen, projectOpen, invoiceOpen, invoiceHistoryOpen, offerOpen, offerHistoryOpen, productOpen, inviteOpen, fileOpen, projectWorkspaceOpen, customerWorkspaceOpen]);

  const invoiceTotal = useMemo(
    () => invoiceDraft.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice * 100), 0),
    [invoiceDraft.lines],
  );
  const offerTotal = useMemo(
    () => offerDraft.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice * 100), 0),
    [offerDraft.lines],
  );
  const convertedOfferIds = useMemo(
    () => new Set(invoices.map((invoice) => invoice.source_offer_id).filter(Boolean)),
    [invoices],
  );
  const searchResults = useMemo(() => {
    const q=searchQuery.trim().toLowerCase();
    if (!q) return [] as Array<{kind:'customer'|'project'|'invoice'|'offer';id:string;label:string;meta:string}>;
    const matches:Array<{kind:'customer'|'project'|'invoice'|'offer';id:string;label:string;meta:string}>=[];
    for (const customer of customers) {
      const label=customerName(customer);
      const hay=[label,customer.email,customer.city].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(q)) matches.push({kind:'customer',id:customer.id,label,meta:customer.email || 'Kunde'});
    }
    for (const project of projects) {
      const label=project.title;
      const hay=[label,relatedName(project.customers),project.status].join(' ').toLowerCase();
      if (hay.includes(q)) matches.push({kind:'project',id:project.id,label,meta:`${relatedName(project.customers)} · ${project.status}`});
    }
    for (const invoice of invoices) {
      const label=invoice.number_finalized ? invoice.invoice_number : 'Rechnungsentwurf';
      const hay=[label,relatedName(invoice.customers),invoice.status,String(invoice.total_rappen)].join(' ').toLowerCase();
      if (hay.includes(q)) matches.push({kind:'invoice',id:invoice.id,label,meta:`${relatedName(invoice.customers)} · ${money(invoice.total_rappen, invoice.currency)}`});
    }
    for (const offer of offers) {
      const label=`${offer.offer_number} · ${offer.title}`;
      const hay=[label,relatedName(offer.customers),offer.status].join(' ').toLowerCase();
      if (hay.includes(q)) matches.push({kind:'offer',id:offer.id,label,meta:`${relatedName(offer.customers)} · ${money(offer.total_rappen)}`});
    }
    return matches.slice(0,20);
  }, [searchQuery, customers, projects, invoices, offers]);

  function selectSearchResult(result:{kind:'customer'|'project'|'invoice'|'offer';id:string}) {
    setSearchOpen(false);
    setSearchQuery('');
    if (result.kind === 'customer') setTab('customers');
    if (result.kind === 'invoice') setTab('invoices');
    if (result.kind === 'offer') setTab('offers');
    if (result.kind === 'project') {
      setTab('projects');
      void loadProjectWorkspace(result.id);
    }
  }

  const metrics = useMemo(() => ({
    paid: invoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.total_rappen || 0), 0),
    open: invoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue').reduce((sum, invoice) => sum + Number(invoice.total_rappen || 0), 0),
    activeProjects: projects.filter((project) => project.status === 'active').length,
    offerPipeline: offers.filter((offer) => offer.status === 'draft' || offer.status === 'sent').reduce((sum, offer) => sum + Number(offer.total_rappen || 0), 0),
  }), [invoices, projects, offers]);

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

  async function openDepartments(customer: Customer) {
    if (!activeWorkspaceId) return;
    try {
      const data = await requestJson<{ departments:Department[] }>(
        `/api/hive/customers/${customer.id}/departments?workspace=${encodeURIComponent(activeWorkspaceId)}`,
      );
      setDepartmentCustomer(customer);
      setDepartments(data.departments);
      setDepartmentDraft({ id:'', name:'', code:'', contactName:'', contactEmail:'', contactPhone:'', isDefault:false, active:true });
      setDepartmentOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Abteilungen konnten nicht geladen werden.');
    }
  }

  async function reloadDepartments() {
    if (!activeWorkspaceId || !departmentCustomer) return;
    const data = await requestJson<{ departments:Department[] }>(
      `/api/hive/customers/${departmentCustomer.id}/departments?workspace=${encodeURIComponent(activeWorkspaceId)}`,
    );
    setDepartments(data.departments);
  }

  async function saveDepartment(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId || !departmentCustomer) return;
    try {
      const payload = {
        workspaceId:activeWorkspaceId,
        name:departmentDraft.name,
        code:departmentDraft.code,
        contactName:departmentDraft.contactName,
        contactEmail:departmentDraft.contactEmail,
        contactPhone:departmentDraft.contactPhone,
        isDefault:departmentDraft.isDefault,
        active:departmentDraft.active,
      };
      if (departmentDraft.id) {
        await requestJson(
          `/api/hive/customers/${departmentCustomer.id}/departments/${departmentDraft.id}`,
          { method:'PATCH', body:JSON.stringify(payload) },
        );
      } else {
        await requestJson(
          `/api/hive/customers/${departmentCustomer.id}/departments`,
          { method:'POST', body:JSON.stringify(payload) },
        );
      }
      setNotice(departmentDraft.id ? 'Abteilung aktualisiert.' : 'Abteilung erstellt.');
      setDepartmentDraft({ id:'', name:'', code:'', contactName:'', contactEmail:'', contactPhone:'', isDefault:false, active:true });
      await reloadDepartments();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Abteilung konnte nicht gespeichert werden.');
    }
  }

  async function deleteDepartment(department: Department) {
    if (!activeWorkspaceId || !departmentCustomer || !confirm(`${department.name} wirklich löschen?`)) return;
    try {
      await requestJson(
        `/api/hive/customers/${departmentCustomer.id}/departments/${department.id}?workspace=${encodeURIComponent(activeWorkspaceId)}`,
        { method:'DELETE' },
      );
      setNotice('Abteilung gelöscht.');
      await reloadDepartments();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Abteilung konnte nicht gelöscht werden.');
    }
  }

  function editDepartment(department: Department) {
    setDepartmentDraft({
      id:department.id,
      name:department.name,
      code:department.code || '',
      contactName:department.contact_name || '',
      contactEmail:department.contact_email || '',
      contactPhone:department.contact_phone || '',
      isDefault:department.is_default,
      active:department.active,
    });
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      const payload = {
        workspaceId: activeWorkspaceId,
        customerId: projectDraft.customerId,
        departmentId: projectDraft.departmentId || null,
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
    if (!activeWorkspaceId || invoice.is_legacy || invoice.status !== 'draft' || invoice.number_finalized) return;
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

  async function openInvoiceHistory(invoice: Invoice) {
    if (!activeWorkspaceId) return;
    setInvoiceHistoryInvoice(invoice);
    setInvoiceHistoryEvents([]);
    setInvoiceSendAttempts([]);
    setInvoiceDocumentAudit(null);
    setInvoiceHistoryBusy(true);
    setInvoiceHistoryOpen(true);
    try {
      const data = await requestJson<{
        events:InvoiceHistoryEvent[];
        attempts:InvoiceSendAttempt[];
        document:InvoiceDocumentAudit|null;
      }>(`/api/hive/invoices/${invoice.id}/history?workspace=${encodeURIComponent(activeWorkspaceId)}`);
      setInvoiceHistoryEvents(data.events);
      setInvoiceSendAttempts(data.attempts);
      setInvoiceDocumentAudit(data.document);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rechnungsverlauf konnte nicht geladen werden.');
      setInvoiceHistoryOpen(false);
    } finally {
      setInvoiceHistoryBusy(false);
    }
  }

  async function prepareDocumentEmailSend(kind:'invoice'|'offer', item:Invoice|Offer) {
    if (sendPreparing || sendConfirmation || invoiceSendBusyIds.has(item.id) || offerSendBusyIds.has(item.id)) return;
    const workspaceId=item.workspace_id;
    setSendPreparing(`${kind}:${item.id}`);
    try {
      const {recipient}=await requestJson<{recipient:EmailRecipient}>(
        `/api/hive/email-recipient?kind=${kind}&documentId=${encodeURIComponent(item.id)}`,
      );
      if (currentWorkspace.current !== workspaceId) return;
      if (kind === 'invoice') setSendConfirmation({kind,item:item as Invoice,recipient,workspaceId});
      else setSendConfirmation({kind,item:item as Offer,recipient,workspaceId});
    } catch(error) {
      setNotice(error instanceof Error ? error.message : 'Empfängeradresse konnte nicht geprüft werden.');
    } finally {
      setSendPreparing('');
    }
  }

  async function invoiceAction(invoice: Invoice, action: 'issue' | 'download' | 'send' | 'mark_paid' | 'cancel', recipient?:EmailRecipient) {
    if (action === 'issue' && !confirm('Rechnung jetzt ausstellen? Die definitive Rechnungsnummer wird vergeben und der Inhalt danach gesperrt.')) return;
    if (action === 'mark_paid' && !confirm(`${invoice.invoice_number} wirklich als bezahlt markieren?`)) return;
    if (action === 'cancel' && !confirm(`${invoice.invoice_number} wirklich stornieren? Dieser Status kann nicht einfach zurückgesetzt werden.`)) return;
    if (action === 'send' && (invoiceSendBusyIds.has(invoice.id) || !recipient)) return;

    let requestKey = '';
    if (action === 'send') {
      const memoryKey = invoiceSendKeys.current.get(invoice.id) || '';
      let storedKey = '';
      try { storedKey = sessionStorage.getItem(invoiceSendStorageKey(invoice.id)) || ''; } catch {}
      requestKey = validRequestKey(memoryKey)
        ? memoryKey
        : validRequestKey(storedKey)
          ? storedKey
          : crypto.randomUUID();
      invoiceSendKeys.current.set(invoice.id, requestKey);
      try { sessionStorage.setItem(invoiceSendStorageKey(invoice.id), requestKey); } catch {}
      setInvoiceSendBusyIds((current) => new Set(current).add(invoice.id));
    }

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
        method: 'POST',
        body: JSON.stringify(action === 'send' ? { action, requestKey, recipient } : { action }),
      });
      if (action === 'send') {
        invoiceSendKeys.current.delete(invoice.id);
        try { sessionStorage.removeItem(invoiceSendStorageKey(invoice.id)); } catch {}
      }
      setNotice(
        action === 'issue' ? 'Rechnung ausgestellt und final nummeriert.'
        : action === 'send' ? 'Rechnung per E-Mail versendet.'
        : action === 'mark_paid' ? 'Rechnung als bezahlt markiert.'
        : 'Rechnung storniert.',
      );
      if (activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(
        action === 'send'
          ? `${error instanceof Error ? error.message : 'Rechnungsversand fehlgeschlagen.'} Ein erneuter Versuch verwendet denselben sicheren Versandauftrag.`
          : error instanceof Error ? error.message : 'Rechnungsaktion fehlgeschlagen.',
      );
    } finally {
      if (action === 'send') {
        setInvoiceSendBusyIds((current) => {
          const next = new Set(current);
          next.delete(invoice.id);
          return next;
        });
      }
    }
  }

  async function duplicateInvoice(invoice: Invoice) {
    try {
      await requestJson(`/api/hive/invoices/${invoice.id}/action`, {
        method:'POST',
        body:JSON.stringify({
          action:'duplicate',
          issueDate:today(),
          dueDate:afterDays(settings?.default_due_days || 30),
        }),
      });
      setNotice(`Kopie von ${invoice.invoice_number} als neuer Entwurf erstellt.`);
      if (activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rechnung konnte nicht dupliziert werden.');
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

  async function convertOfferToInvoice(offer: Offer) {
    if (!activeWorkspaceId) return;
    try {
      await requestJson(`/api/hive/offers/${offer.id}`, {
        method:'POST',
        body:JSON.stringify({
          action:'convert',
          issueDate:today(),
          dueDate:afterDays(settings?.default_due_days || 30),
        }),
      });
      setNotice('Rechnungsentwurf aus Offerte erstellt.');
      await loadWorkspaceData(activeWorkspaceId);
      setTab('invoices');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Offerte konnte nicht in eine Rechnung umgewandelt werden.');
    }
  }

  async function openOfferHistory(offer: Offer) {
    if (!activeWorkspaceId) return;
    setOfferHistoryOffer(offer);
    setOfferHistoryEvents([]);
    setOfferSendAttempts([]);
    setOfferHistoryInvoice(null);
    setOfferHistoryBusy(true);
    setOfferHistoryOpen(true);
    try {
      const data = await requestJson<{
        events:OfferHistoryEvent[];
        attempts:OfferSendAttempt[];
        invoice:OfferHistoryInvoice|null;
      }>(`/api/hive/offers/${offer.id}/history?workspace=${encodeURIComponent(activeWorkspaceId)}`);
      setOfferHistoryEvents(data.events);
      setOfferSendAttempts(data.attempts);
      setOfferHistoryInvoice(data.invoice);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Offertenverlauf konnte nicht geladen werden.');
      setOfferHistoryOpen(false);
    } finally {
      setOfferHistoryBusy(false);
    }
  }

  async function duplicateOffer(offer:Offer) {
    try {
      await requestJson(`/api/hive/offers/${offer.id}`,{
        method:'POST',
        body:JSON.stringify({
          action:'duplicate',
          issueDate:today(),
          validUntil:afterDays(30),
        }),
      });
      setNotice(`Kopie von ${offer.offer_number} erstellt.`);
      if (activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Offerte konnte nicht dupliziert werden.');
    }
  }

  async function offerAction(offer: Offer, action: 'share' | 'withdraw' | 'delete' | 'send', recipient?:EmailRecipient) {
    if (action === 'delete' && !confirm(`${offer.offer_number} wirklich löschen?`)) return;
    if (action === 'withdraw' && !confirm(`${offer.offer_number} wirklich zurückziehen?`)) return;
    if (action === 'send' && (offerSendBusyIds.has(offer.id) || !recipient)) return;

    let requestKey = '';
    if (action === 'send') {
      const memoryKey = offerSendKeys.current.get(offer.id) || '';
      let storedKey = '';
      try { storedKey = sessionStorage.getItem(offerSendStorageKey(offer.id)) || ''; } catch {}
      requestKey = validRequestKey(memoryKey)
        ? memoryKey
        : validRequestKey(storedKey)
          ? storedKey
          : crypto.randomUUID();
      offerSendKeys.current.set(offer.id, requestKey);
      try { sessionStorage.setItem(offerSendStorageKey(offer.id), requestKey); } catch {}
      setOfferSendBusyIds((current) => new Set(current).add(offer.id));
    }

    try {
      await requestJson(`/api/hive/offers/${offer.id}`, {
        method: 'POST',
        body: JSON.stringify(action === 'send' ? { action, requestKey } : { action }),
      });
      if (action === 'send') {
        offerSendKeys.current.delete(offer.id);
        try { sessionStorage.removeItem(offerSendStorageKey(offer.id)); } catch {}
      }
      setNotice(
        action === 'share' ? 'Offerte im Kundenportal freigegeben.'
        : action === 'send' ? 'Offerte per E-Mail versendet.'
        : action === 'withdraw' ? 'Offerte zurückgezogen.'
        : 'Offertenentwurf gelöscht.',
      );
      if (activeWorkspaceId) await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(
        action === 'send'
          ? `${error instanceof Error ? error.message : 'Offertenversand fehlgeschlagen.'} Ein erneuter Versuch verwendet denselben sicheren Versandauftrag.`
          : error instanceof Error ? error.message : 'Offertenaktion fehlgeschlagen.',
      );
    } finally {
      if (action === 'send') {
        setOfferSendBusyIds((current) => {
          const next = new Set(current);
          next.delete(offer.id);
          return next;
        });
      }
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

  function openOfferDocument(offer:Offer) {
    if (!activeWorkspaceId) return;
    const url=`/api/hive/offers/${offer.id}/document?workspace=${encodeURIComponent(activeWorkspaceId)}`;
    window.open(url,'_blank','noopener,noreferrer');
  }

  async function openOfferDraft(offer: Offer) {
    if (!activeWorkspaceId || offer.status !== 'draft') return;
    try {
      const data = await requestJson<{
        offer: Offer & { notes:string; terms:string };
        items:Array<{description:string;quantity:number|string;unit_price_rappen:number}>;
      }>(`/api/hive/offers/${offer.id}?workspace=${encodeURIComponent(activeWorkspaceId)}`);
      setOfferDraft({
        id:offer.id,
        customerId:data.offer.customer_id,
        projectId:data.offer.project_id || '',
        title:data.offer.title,
        issueDate:data.offer.issue_date,
        validUntil:data.offer.valid_until,
        taxRate:Number(data.offer.tax_rate || 0),
        notes:data.offer.notes || '',
        terms:data.offer.terms || 'Diese Offerte ist bis zum angegebenen Datum gültig.',
        lines:data.items.map((item) => ({
          description:item.description,
          quantity:Number(item.quantity),
          unitPrice:Number(item.unit_price_rappen) / 100,
        })),
      });
      setOfferOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Offertenentwurf konnte nicht geladen werden.');
    }
  }

  async function createOffer(event: FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId) return;
    try {
      const payload = {
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
      };
      if (offerDraft.id) {
        await requestJson(`/api/hive/offers/${offerDraft.id}`, {
          method:'PATCH',
          body:JSON.stringify(payload),
        });
      } else {
        await requestJson('/api/hive/offers', {
          method:'POST',
          body:JSON.stringify(payload),
        });
      }
      setOfferOpen(false);
      setNotice(offerDraft.id ? 'Offertenentwurf aktualisiert.' : 'Offertenentwurf erstellt.');
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

  function createPortalInvite(event:FormEvent) {
    event.preventDefault();
    if (!activeWorkspaceId || !inviteDraft.email) return;
    const customer=customers.find((item) => item.id === inviteDraft.customerId);
    setSendConfirmation({
      kind:'portal', workspaceId:activeWorkspaceId, invite:{...inviteDraft},
      recipient:{email:inviteDraft.email,name:customerName(customer),cc:[]},
    });
  }

  async function dispatchPortalInvite(invite:{customerId:string;departmentId:string;email:string},workspaceId:string) {
    try {
      const result=await requestJson<{emailSent?:boolean;email?:string;message?:string}>('/api/hive/portal',{
        method:'POST',
        body:JSON.stringify({
          action:'create_invite',workspaceId,
          customerId:invite.customerId,
          departmentId:invite.departmentId || null,
          email:invite.email,
        }),
      });
      setInviteOpen(false);
      setNotice(result.emailSent
        ? `Portal-Einladung an ${result.email || invite.email} versendet.`
        : result.message || 'Dev-Einladung angelegt. Es wurde keine E-Mail versendet.');
      if (currentWorkspace.current === workspaceId) await loadWorkspaceData(workspaceId);
    } catch(error) {
      setNotice(error instanceof Error ? error.message : 'Portal-Einladung konnte nicht erstellt werden.');
    }
  }

  async function confirmEmailSend() {
    const pending=sendConfirmation;
    if (!pending || sendConfirmationBusy) return;
    if (currentWorkspace.current !== pending.workspaceId) {
      setSendConfirmation(null);
      setNotice('Business gewechselt. Bitte Versand erneut starten.');
      return;
    }
    setSendConfirmationBusy(true);
    try {
      if (pending.kind === 'invoice') await invoiceAction(pending.item,'send',pending.recipient);
      else if (pending.kind === 'offer') await offerAction(pending.item,'send',pending.recipient);
      else await dispatchPortalInvite(pending.invite,pending.workspaceId);
    } finally {
      setSendConfirmationBusy(false);
      setSendConfirmation(null);
    }
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
        departmentId:fileDraft.departmentId || null,
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
      setFileDraft({ customerId:'', departmentId:'', projectId:'', title:'', kind:'document', file:null });
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

  async function saveEmailTemplate(template: EmailTemplateRow) {
    if (!activeWorkspaceId) return;
    try {
      await requestJson('/api/hive/email-templates', {
        method:'PUT',
        body:JSON.stringify({
          workspaceId:activeWorkspaceId,
          templateKey:template.template_key,
          subjectTemplate:template.subject_template,
          textTemplate:template.text_template,
        }),
      });
      setNotice('E-Mail-Vorlage gespeichert.');
      await loadWorkspaceData(activeWorkspaceId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'E-Mail-Vorlage konnte nicht gespeichert werden.');
    }
  }

  async function uploadBusinessLogo(file: File | null) {
    if (!file || !activeWorkspaceId || !settings) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
      setNotice('Logo muss PNG, JPG oder WebP sein.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice('Logo darf maximal 5 MB gross sein.');
      return;
    }
    try {
      const prepared=await requestJson<{bucket:string;storagePath:string;token:string}>('/api/hive/branding/logo',{
        method:'POST',
        body:JSON.stringify({
          action:'prepare_upload',
          workspaceId:activeWorkspaceId,
          mimeType:file.type,
          bytes:file.size,
        }),
      });
      const supabase=createPublicSupabaseBrowserClient();
      const {error:uploadError}=await supabase.storage
        .from(prepared.bucket)
        .uploadToSignedUrl(prepared.storagePath,prepared.token,file);
      if(uploadError) throw uploadError;

      const completed=await requestJson<{logoUrl:string}>('/api/hive/branding/logo',{
        method:'POST',
        body:JSON.stringify({
          action:'complete_upload',
          workspaceId:activeWorkspaceId,
          storagePath:prepared.storagePath,
        }),
      });
      setSettings({...settings,logo_url:completed.logoUrl});
      setNotice('Business-Logo hochgeladen.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Logo konnte nicht hochgeladen werden.');
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
          invoiceRemindersEnabled:settings.invoice_reminders_enabled,
          invoiceReminderDays:Number(settings.invoice_reminder_days),
        }),
      });
      setSettings(data.settings);
      setWorkspaces((current) => current.map((workspace) =>
        workspace.id === activeWorkspaceId
          ? { ...workspace, name:data.settings.business_name }
          : workspace
      ));
      setNotice('Business-Einstellungen gespeichert.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden.');
    }
  }

  async function archiveBusiness() {
    if (!activeWorkspaceId || !activeWorkspace) return;
    if (!activeWorkspace.slug.startsWith('hive-dev-')) {
      setNotice('Live-Workspaces können in der Preview nicht archiviert werden.');
      return;
    }
    if (!confirm(`${businessName} wirklich archivieren? Die Daten bleiben erhalten, der Workspace verschwindet aber aus dem aktiven Switcher.`)) return;
    try {
      await requestJson(`/api/hive/workspaces/${activeWorkspaceId}`, { method:'DELETE' });
      const remaining=workspaces.filter((workspace) => workspace.id !== activeWorkspaceId);
      setWorkspaces(remaining);
      setActiveWorkspaceId(remaining[0]?.id || '');
      setTab('overview');
      setNotice('Business archiviert.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Business konnte nicht archiviert werden.');
    }
  }

  async function openCustomerWorkspace(customer:Customer) {
    if (!activeWorkspaceId) return;
    try {
      const data=await requestJson<CustomerWorkspaceData>(
        `/api/hive/customers/${customer.id}/workspace?workspace=${encodeURIComponent(activeWorkspaceId)}`,
      );
      setCustomerWorkspace(data);
      setCustomerWorkspaceOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Kunden-Workspace konnte nicht geladen werden.');
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

  async function updateProjectStatus(project:Project,status:Project['status']) {
    if (!activeWorkspaceId || project.status===status) return;
    const previous=project.status;
    setProjects((current)=>current.map((item)=>item.id===project.id?{...item,status}:item));
    try {
      const data=await requestJson<{project:Project}>(`/api/hive/projects/${project.id}`,{
        method:'PATCH',
        body:JSON.stringify({workspaceId:activeWorkspaceId,status}),
      });
      setProjects((current)=>current.map((item)=>item.id===project.id?{...item,status:data.project.status}:item));
      setNotice(`${project.title}: ${stateLabel[status] || status}.`);
    } catch (error) {
      setProjects((current)=>current.map((item)=>item.id===project.id?{...item,status:previous}:item));
      setNotice(error instanceof Error ? error.message : 'Projektstatus konnte nicht geändert werden.');
    }
  }

  const openProject = async (project?: Project) => {
    if (project) {
      setProjectDraft({
        id: project.id, customerId: project.customer_id, departmentId:project.department_id, title: project.title,
        description: project.description || '', status: project.status,
        budget: project.budget_rappen / 100, startDate: project.start_date || '', dueDate: project.due_date || '',
      });
      setProjectOpen(true);
      return;
    }
    const customerId=customers[0]?.id || '';
    const items=await loadScopeDepartments(customerId);
    setProjectDraft({
      id:'', customerId, departmentId:preferredDepartmentId(items), title:'', description:'', status:'planning',
      budget:0, startDate:'', dueDate:'',
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
          <p>Bitte melde dich erneut an oder versuche es in einem Moment nochmals.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <a href="/login">Zum Login</a>
            <button className="hsv-outline" onClick={() => void loadWorkspaces()}><RefreshCw size={14}/> Erneut prüfen</button>
          </div>
        </div>
      </section>
    </main>;
  }

  const nav = [
    ['businesses', 'Businesses', Building2] as const,
    ['overview', 'Übersicht', LayoutDashboard] as const,
    ['customers', 'Kunden', Users] as const,
    ['projects', 'Projekte', BriefcaseBusiness] as const,
    ...(canViewFinance ? [
      ['invoices', 'Rechnungen', CreditCard] as const,
      ['offers', 'Offerten', FileText] as const,
      ['catalog', 'Leistungen', Package] as const,
    ] : []),
    ...(canAdmin ? [['emails', 'E-Mail', Mail] as const] : []),
    ['portal', 'Portal', ShieldCheck] as const,
    ['activity', 'Aktivität', RefreshCw] as const,
    ...(canAdmin ? [['team', 'Team', Users] as const, ['branding', 'Einstellungen', Settings2] as const] : []),
  ];

  const matchesList = (...values:unknown[]) => values.filter(Boolean).join(' ').toLocaleLowerCase('de-CH').includes(listQuery.toLocaleLowerCase('de-CH').trim());
  const visibleCustomers = customers.filter(c => matchesList(customerName(c), c.contact_name, c.email, c.phone, c.address_line1, c.postal_code, c.city, c.country, c.notes));
  const visibleProjects = projects.filter(p => matchesList(p.title,relatedName(p.customers)) && (listStatus === 'all' || p.status === listStatus));
  const visibleInvoices = invoices.filter(i => matchesList(i.invoice_number,relatedName(i.customers)) && (listStatus === 'all' || i.status === listStatus));
  const visibleOffers = offers.filter(o => matchesList(o.title,o.offer_number,relatedName(o.customers)) && (listStatus === 'all' || o.status === listStatus));
  const listTabs = ['customers','projects','invoices','offers'].includes(tab);
  const headingCopy:Partial<Record<Tab,string>> = {businesses:'Alle deine Businesses, getrennt geführt und gemeinsam im Blick.',overview:'Dein Studio auf einen Blick.',customers:'Kontakte, Beziehungen und die gemeinsame Arbeit.',projects:'Von der ersten Idee bis zur letzten Abgabe.',invoices:'Rechnungen, Fälligkeiten und Zahlungseingänge.',offers:'Aus Anfragen werden konkrete Aufträge.',catalog:'Deine Leistungen und Preise an einem Ort.',portal:'Dokumente und Freigaben für deine Kunden.',activity:'Was sich in deinem Workspace verändert hat.'};


  return <div className="hsv hive-system-app hive-flow-app" style={{ '--business-accent': accent } as React.CSSProperties}>
    <header className="hsv-top">
      <div className="hsv-identity">
        <a className="hsv-hive" href="/" aria-label="Hive Startseite"><span className="hive-app-mark" aria-hidden="true">h</span><span>hive<span className="hive-wordmark-dot">.</span></span></a><span className="hsv-divider"/>
        <span className="hsv-logo">{settings?.logo_url ? <img src={settings.logo_url} alt="Business Logo"/> : businessName.charAt(0)}</span>
        <select aria-label="Business auswählen" value={activeWorkspaceId} onChange={(event) => switchWorkspace(event.target.value, tab === 'businesses' ? 'businesses' : tab)}>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspaceLabel(workspace)}</option>)}
        </select>
        <button className="hsv-outline" aria-label="Neues Business erstellen" type="button" onClick={() => {
          setBusinessDraft({ name:'', invoicePrefix:'HIVE' });
          setBusinessOpen(true);
        }}><Plus size={14}/> Business</button>
      </div>
      <button className="hsv-outline" aria-label="Workspace durchsuchen" type="button" onClick={() => setSearchOpen(true)}><Search size={14}/> Suchen … <kbd>⌘K</kbd></button>
      <button className="hive-install-trigger" aria-label="Als App installieren" onClick={()=>setInstallOpen(true)}><Smartphone size={17}/><span>Als App installieren</span></button><span className="hsv-mode"><span/> Dev Preview</span>
      <ThemeToggle/>
      <a className="hsv-back" href="/account">Mein Konto <ArrowRight size={15}/></a>
    </header>

    <div className="hsv-layout">
      <WorkspaceNavigation items={nav} active={tab} onSelect={setTab} customerCount={customers.length}/>

      <main className="hsv-main">
        <div className="hive-breadcrumb"><span>{tab === 'businesses' ? 'Hive' : businessName.replace(/^Hive Dev · /,'')}</span><span>/</span><strong>{nav.find(([id])=>id===tab)?.[1]}</strong><time>{new Intl.DateTimeFormat('de-CH',{weekday:'short',day:'2-digit',month:'long',year:'numeric'}).format(new Date())}</time></div>
        <div className="hsv-heading" key={tab}>
          <div className="hive-document-heading"><h1>{nav.find(([id]) => id === tab)?.[1]}</h1><p>{busy ? 'Daten werden geladen …' : (headingCopy[tab] || 'Alles Wichtige an einem Ort.')}</p></div>
        </div>
        {listTabs && tab !== 'customers' && <div className="hive-list-tools"><label><Search size={15}/><input aria-label="Liste durchsuchen" placeholder="Suchen nach Name, Kunde oder Nummer …" value={listQuery} onChange={e=>setListQuery(e.target.value)}/>{listQuery&&<button aria-label="Suche leeren" onClick={()=>setListQuery('')}><X size={13}/></button>}</label><div className="hive-status-pill"><select aria-label="Status filtern" value={listStatus} onChange={e=>setListStatus(e.target.value)}><option value="all">Alle Status</option>{(tab==='projects'?['planning','active','on_hold','completed']:tab==='invoices'?['draft','sent','overdue','paid','cancelled']:['draft','sent','accepted','withdrawn','expired']).map(value=><option value={value} key={value}>{stateLabel[value]}</option>)}</select><ChevronDown size={15} aria-hidden="true"/></div><span>{tab === 'projects'?visibleProjects.length:tab === 'invoices'?visibleInvoices.length:visibleOffers.length} Einträge</span></div>}

        {!busy && !workspaces.length ? <div className="hsv-empty"><Building2 size={24}/><strong>Noch kein Business verfügbar.</strong><p>Erstelle dein erstes Business oder nimm eine Einladung in deinem Konto an.</p><button className="hsv-outline" onClick={()=>setBusinessOpen(true)}>Business erstellen</button></div> : backendError ? <div className="hsv-empty" role="alert"><strong>Workspace konnte nicht geladen werden.</strong><p>{backendError}</p><button className="hsv-outline" onClick={() => void loadWorkspaceData(activeWorkspaceId)}>Erneut versuchen</button></div> : !activeWorkspaceId || loadedWorkspaceId !== activeWorkspaceId ? <div className="hive-loading-state" role="status" aria-label="Business wird geladen">
          <div className="hive-loading-line hive-loading-title"/>
          <div className="hive-loading-line hive-loading-copy"/>
          <div className="hive-loading-cards">{[0,1,2,3].map((item)=><span key={item}/>)}</div>
          <div className="hive-loading-panel"><span/><span/><span/></div>
        </div> : <>
        {Object.keys(secondaryIssues).length > 0 && <aside className="hive-module-notice" role="status"><div><strong>Ein Zusatzmodul ist gerade nicht erreichbar.</strong><p>Kunden, Projekte und Finanzen bleiben verfügbar. Betroffen: {Object.keys(secondaryIssues).map(key=>({emails:'E-Mail',portal:'Portal',activity:'Aktivität'}[key])).join(', ')}.</p></div><button type="button" onClick={()=>void loadWorkspaceData(activeWorkspaceId)}>Verbindung erneut prüfen</button></aside>}
        {secondaryPending && ['emails','portal','activity'].includes(tab) && <div className="hsv-empty" role="status">Modul wird geladen …</div>}
        {secondaryIssues[tab] && <div className="hsv-empty" role="alert"><strong>Dieses Modul ist vorübergehend nicht verfügbar.</strong><p>{secondaryIssues[tab]}</p><button className="hsv-outline" onClick={()=>void loadWorkspaceData(activeWorkspaceId)}>Erneut versuchen</button></div>}
        {tab === 'businesses' && <BusinessesOverview
          items={businessesOverview}
          busy={businessesOverviewBusy}
          error={businessesOverviewError}
          onRefresh={()=>void loadBusinessesOverview()}
          onOpen={(workspaceId)=>switchWorkspace(workspaceId,'overview')}
        />}

        {tab === 'overview' && <WorkspaceOverview invoices={invoices} projects={projects} customerCount={customers.length} offerCount={offers.filter(o=>o.status==='draft'||o.status==='sent').length} activity={activityFeed} canViewFinance={canViewFinance} onNavigate={setTab} onProject={id=>void loadProjectWorkspace(id)} onCreateProject={()=>void openProject()}/>}

        {tab === 'customers' && <CustomerDirectory customers={visibleCustomers} total={customers.length} query={listQuery} onQuery={setListQuery} onCreate={()=>openCustomer()} onOpen={customer=>void openCustomerWorkspace(customer)} onEdit={openCustomer} onDepartments={customer=>void openDepartments(customer)} onDelete={customer=>void deleteCustomer(customer)}/>}

        {tab === 'projects' && <>
          <div className="hsv-rowtop">
            <strong>{projects.length} Projekte</strong>
            <div className="hive-row-actions">
              <WorkspaceViewSwitch value={projectView} onChange={setProjectView}/>
              <button className="hsv-primary" disabled={!customers.length} onClick={() => void openProject()}><Plus size={15}/> Projekt erstellen</button>
            </div>
          </div>
          {projectView === 'board' ? <ProjectBoard
            projects={visibleProjects}
            onStatus={(project,status)=>void updateProjectStatus(project as Project,status)}
            onOpen={(projectId)=>void loadProjectWorkspace(projectId)}
            onEdit={(project)=>void openProject(project as Project)}
          /> : projectView === 'calendar' ? <ProjectCalendar
            projects={visibleProjects}
            onOpen={(projectId)=>void loadProjectWorkspace(projectId)}
          /> : <div className="hsv-table hive-project-table">{visibleProjects.map((project) => <div key={project.id}>
            <div className="hive-project-identity"><span className="hsv-letter"><BriefcaseBusiness size={16}/></span>
            <span className="hsv-grow"><strong>{project.title}</strong><small>{relatedName(project.customers)}</small></span></div>
            <span className="hive-status" data-state={project.status}>{stateLabel[project.status] || project.status}</span><strong className="hive-table-amount">{money(project.budget_rappen)}</strong>
            <div className="hive-record-actions">
            <button onClick={() => void loadProjectWorkspace(project.id)}>Projekt öffnen <ArrowUpRight size={14}/></button>
            <button aria-label={`Projekt ${project.title} bearbeiten`} onClick={() => void openProject(project)}><Pencil size={15}/></button>
            <button aria-label="Projekt löschen" onClick={() => void deleteProject(project)}><Trash2 size={16}/></button>
            </div>
          </div>)}{!visibleProjects.length && <div className="hive-no-results"><Search size={17}/><span>Keine passenden Einträge.</span><small>{listQuery || listStatus !== 'all' ? 'Passe die Suche oder den Statusfilter an.' : 'Neue Einträge erscheinen hier.'}</small></div>}</div>}
        </>}

        {tab === 'invoices' && <>
          <div className="hsv-rowtop"><strong>{invoices.length} Rechnungen</strong><button className="hsv-primary" disabled={!customers.length} onClick={openNewInvoice}><Plus size={15}/> Rechnung erstellen</button></div>
          <div className="hive-table-labels hive-invoice-labels"><span>Rechnung / Kunde</span><span>Status</span><span>Fälligkeit</span><span>Betrag / Aktionen</span></div><div className="hsv-table hive-invoice-table">{visibleInvoices.map((invoice) => <div key={invoice.id}>
            <span className="hsv-letter"><CreditCard size={16}/></span>
            <span className="hsv-grow"><strong>{invoice.number_finalized ? invoice.invoice_number : 'Entwurf'}</strong><small>{relatedName(invoice.customers)}</small></span><span className={`hive-status status-${invoice.status}`} data-state={invoice.status}>{stateLabel[invoice.status] || invoice.status}</span><span className="hive-table-date">{shortDate(invoice.due_date)}</span>
            <strong>{money(invoice.total_rappen, invoice.currency)}</strong>
            <div className="hive-record-actions">
            <button onClick={() => void openInvoiceHistory(invoice)}><Clock3 size={14}/> Verlauf</button>
            <button onClick={() => void duplicateInvoice(invoice)}>Duplizieren</button>
            {invoice.number_finalized && <button onClick={() => void invoiceAction(invoice, 'download')}>PDF</button>}
            {!invoice.is_legacy && invoice.number_finalized && ['draft','sent','overdue'].includes(invoice.status) && <button aria-label="Rechnung per E-Mail senden" disabled={invoiceSendBusyIds.has(invoice.id) || Boolean(sendPreparing)} aria-busy={invoiceSendBusyIds.has(invoice.id) || sendPreparing === `invoice:${invoice.id}`} onClick={() => void prepareDocumentEmailSend('invoice', invoice)}>{invoiceSendBusyIds.has(invoice.id) ? 'Wird gesendet …' : sendPreparing === `invoice:${invoice.id}` ? 'Prüfe Empfänger …' : 'E-Mail'}</button>}
            {invoice.status === 'draft' && !invoice.is_legacy && !invoice.number_finalized && <button onClick={() => void openInvoiceDraft(invoice)}>Bearbeiten</button>}
            {invoice.status === 'draft' && !invoice.is_legacy && !invoice.number_finalized && <button onClick={() => void invoiceAction(invoice, 'issue')}>Ausstellen</button>}
            {invoice.status === 'draft' && !invoice.is_legacy && !invoice.number_finalized && <button aria-label="Rechnung löschen" onClick={() => void deleteInvoice(invoice)}><Trash2 size={16}/></button>}
            {!invoice.is_legacy && (invoice.status === 'sent' || invoice.status === 'overdue') && <button onClick={() => void invoiceAction(invoice, 'mark_paid')}>Bezahlt</button>}
            {!invoice.is_legacy && invoice.number_finalized && invoice.status !== 'paid' && invoice.status !== 'cancelled' && <button onClick={() => void invoiceAction(invoice, 'cancel')}>Stornieren</button>}
            </div>
          </div>)}{!visibleInvoices.length && <div className="hive-no-results"><Search size={17}/><span>Keine passenden Einträge.</span><small>{listQuery || listStatus !== 'all' ? 'Passe die Suche oder den Statusfilter an.' : 'Neue Einträge erscheinen hier.'}</small></div>}</div>
          <p className="hsv-warning">Der E-Mail-Versand ist in dieser Dev-Preview absichtlich serverseitig gesperrt.</p>
        </>}

        {tab === 'offers' && <>
          <div className="hsv-rowtop"><strong>{offers.length} Offerten</strong><button className="hsv-primary" disabled={!customers.length} onClick={openNewOffer}><Plus size={15}/> Offerte erstellen</button></div>
          <div className="hsv-table hive-offer-table">{visibleOffers.map((offer) => <div key={offer.id}>
            <span className="hsv-letter"><FileText size={16}/></span>
            <span className="hsv-grow"><strong>{offer.offer_number} · {offer.title}</strong><small>{relatedName(offer.customers)} · gültig bis {shortDate(offer.valid_until)}</small></span>
            <span className="hive-status" data-state={offer.status}>{stateLabel[offer.status] || offer.status}</span><strong className="hive-table-amount">{money(offer.total_rappen)}</strong>
            <div className="hive-record-actions">
            <button onClick={() => void openOfferHistory(offer)}><Clock3 size={14}/> Verlauf</button>
            <button onClick={() => void duplicateOffer(offer)}>Duplizieren</button>
            <button onClick={() => openOfferDocument(offer)}>Drucken/PDF</button>
            {offer.status === 'draft' && <button onClick={() => void openOfferDraft(offer)}>Bearbeiten</button>}
            {offer.status === 'draft' && <button onClick={() => void offerAction(offer, 'share')}>Portal freigeben</button>}
            {offer.status === 'sent' && <button aria-label="Offerte per E-Mail senden" disabled={offerSendBusyIds.has(offer.id) || Boolean(sendPreparing)} aria-busy={offerSendBusyIds.has(offer.id) || sendPreparing === `offer:${offer.id}`} onClick={() => void prepareDocumentEmailSend('offer', offer)}>{offerSendBusyIds.has(offer.id) ? 'Wird gesendet …' : sendPreparing === `offer:${offer.id}` ? 'Prüfe Empfänger …' : 'E-Mail'}</button>}
            {offer.status === 'sent' && <button onClick={() => void offerAction(offer, 'withdraw')}>Zurückziehen</button>}
            {offer.status === 'accepted' && !convertedOfferIds.has(offer.id) && <button onClick={() => void convertOfferToInvoice(offer)}>Rechnung erstellen</button>}
            {offer.status === 'accepted' && convertedOfferIds.has(offer.id) && <small>Rechnung erstellt</small>}
            {offer.status === 'draft' && <button aria-label="Offerte löschen" onClick={() => void offerAction(offer, 'delete')}><Trash2 size={16}/></button>}
            </div>
          </div>)}{!visibleOffers.length && <div className="hive-no-results"><Search size={17}/><span>Keine passenden Einträge.</span><small>{listQuery || listStatus !== 'all' ? 'Passe die Suche oder den Statusfilter an.' : 'Neue Einträge erscheinen hier.'}</small></div>}</div>
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

        {tab === 'emails' && !secondaryPending && !secondaryIssues['emails'] && <>
          <div className="hive-mobile-subtabs" role="tablist" aria-label="E-Mail-Bereiche">
            <button role="tab" aria-selected={emailMobileView==='templates'} onClick={() => setEmailMobileView('templates')}>Vorlagen</button>
            <button role="tab" aria-selected={emailMobileView==='history'} onClick={() => setEmailMobileView('history')}>Verlauf</button>
          </div>
          <section className="hive-email-mobile-section" data-mobile-active={emailMobileView==='templates'}>
          <div className="hsv-rowtop"><strong>E-Mail-Vorlagen</strong><button className="hsv-outline" onClick={() => activeWorkspaceId && void loadWorkspaceData(activeWorkspaceId)}><RefreshCw size={14}/> Aktualisieren</button></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14,marginBottom:30}}>
            {emailTemplates.map((template,index) => <div className="hsv-branding" key={template.template_key} style={{margin:0}}>
              <span className="auth-kicker">{template.template_key.replaceAll('_',' ').toUpperCase()}</span>
              <label>Betreff<input value={template.subject_template} onChange={(e) => setEmailTemplates((current) => current.map((item,i) => i === index ? { ...item, subject_template:e.target.value } : item))}/></label>
              <label>Text<textarea rows={7} value={template.text_template} onChange={(e) => setEmailTemplates((current) => current.map((item,i) => i === index ? { ...item, text_template:e.target.value } : item))}/></label>
              <small>{'Variablen: {{first_name}}, {{company_name}}, {{owner_name}}, {{invoice_number}}, {{offer_number}}, {{amount}}, {{due_date}}, {{portal_link}}'}</small>
              <button className="hsv-primary" type="button" onClick={() => void saveEmailTemplate(template)}>Vorlage speichern <Check size={15}/></button>
            </div>)}
          </div>
          </section>
          <section className="hive-email-mobile-section" data-mobile-active={emailMobileView==='history'}>
          <div className="hsv-rowtop"><strong>{emails.length} Versandereignisse</strong></div>
          <div className="hsv-table">{emails.map((email) => <div key={email.id}>
            <span className="hsv-letter"><Mail size={16}/></span>
            <span className="hsv-grow"><strong>{email.subject}</strong><small>{email.template_key} · {email.status} · {new Date(email.created_at).toLocaleString('de-CH')}</small></span>
            <small>{email.recipient_email}</small>
          </div>)}</div>
          <p className="hsv-warning">Historische Empfänger in der Dev-Kopie wurden neutralisiert. Echte Dev-Mails bleiben gesperrt.</p>
          </section>
        </>}

        {tab === 'portal' && !secondaryPending && !secondaryIssues['portal'] && <>
          <div className="hsv-rowtop">
            <strong>{canAdmin ? `${portal.memberships.length} Mitglieder · ${portal.invites.length} Einladungen` : 'Kundenportal & Dateien'}</strong>
            {canAdmin && <button className="hsv-primary" disabled={!customers.length} onClick={() => void openPortalInvite()}><Plus size={15}/> Portal-Einladung</button>}
          </div>

          <div className="hsv-intro" style={{ marginBottom: 18 }}>
            <span className="hsv-big-logo"><ShieldCheck size={26}/></span>
            <div><span>KUNDENPORTAL</span><h2>Zugänge & Freigaben</h2><p>Einladungen, Portal-Mitglieder, Dateien, Reviews und Kundenanfragen laufen pro Business und Department. {activeWorkspace?.slug.startsWith('hive-dev-') ? 'Im Dev-Modus wird keine Einladung per E-Mail versendet.' : 'Portal-Einladungen werden per E-Mail an die hinterlegte Kontaktadresse verschickt.'}</p></div>
          </div>
          <div className="hive-mobile-subtabs" role="tablist" aria-label="Portal-Bereiche">
            {canAdmin && <button role="tab" aria-selected={portalMobileView==='access'} onClick={() => setPortalMobileView('access')}>Zugänge</button>}
            <button role="tab" aria-selected={portalMobileView==='files'} onClick={() => setPortalMobileView('files')}>Dateien</button>
            {canAdmin && <button role="tab" aria-selected={portalMobileView==='requests'} onClick={() => setPortalMobileView('requests')}>Anfragen</button>}
            <button role="tab" aria-selected={portalMobileView==='activity'} onClick={() => setPortalMobileView('activity')}>Verlauf</button>
          </div>

          {canAdmin && <section className="hive-portal-section" data-mobile-active={portalMobileView==='access'}>
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
          </section>}

          {canAdmin && <section className="hive-portal-section" data-mobile-active={portalMobileView==='requests'}>
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
          </section>}

          <section className="hive-portal-section" data-mobile-active={portalMobileView==='files'}>
          <div className="hsv-rowtop" style={{ marginTop: 24 }}>
            <strong>Dateien</strong>
            <button className="hsv-primary" disabled={!customers.length} onClick={() => void openPortalFile()}><Plus size={15}/> Datei hochladen</button>
          </div>
          <div className="hsv-table">{portal.files.length ? portal.files.map((file) => <div key={file.id}>
            <span className="hsv-letter"><FileText size={16}/></span>
            <span className="hsv-grow"><strong>{file.title}</strong><small>{file.original_filename} · {file.kind} · {file.published_at ? 'veröffentlicht' : 'Entwurf'}{file.bytes ? ` · ${(file.bytes / 1024 / 1024).toFixed(1)} MB` : ''}</small></span>
            <button onClick={() => void downloadPortalFile(file)}>Download</button>
            <button onClick={() => void togglePortalFile(file)}>{file.published_at ? 'Unpublish' : 'Publish'}</button>
            <button aria-label="Datei löschen" onClick={() => void deletePortalFile(file)}><Trash2 size={16}/></button>
          </div>) : <p className="hsv-empty">Keine Portal-Dateien.</p>}</div>
          </section>

          <section className="hive-portal-section" data-mobile-active={portalMobileView==='activity'}>
          <div className="hsv-rowtop" style={{ marginTop: 24 }}><strong>Letzte Aktivität</strong></div>
          <div className="hsv-table">{portal.activity.slice(0, 20).map((item) => <div key={item.id}>
            <span className="hsv-letter"><RefreshCw size={15}/></span>
            <span className="hsv-grow"><strong>{item.summary}</strong><small>{item.event_type} · {new Date(item.created_at).toLocaleString('de-CH')}</small></span>
          </div>)}</div>
          </section>
        </>}

        {tab === 'activity' && !secondaryPending && !secondaryIssues['activity'] && <>
          <div className="hsv-rowtop">
            <strong>{activityFeed.length} Ereignisse</strong>
            <button className="hsv-outline" onClick={() => activeWorkspaceId && void loadWorkspaceData(activeWorkspaceId)}><RefreshCw size={14}/> Aktualisieren</button>
          </div>
          <div className="hsv-table">
            {activityFeed.length ? activityFeed.map((item) => <div key={`${item.source}-${item.id}`}>
              <span className="hsv-letter">{item.source === 'invoice' ? 'R' : item.source === 'offer' ? 'O' : item.source === 'email' ? '@' : '•'}</span>
              <span className="hsv-grow">
                <strong>{item.summary}</strong>
                <small>{item.source} · {item.kind.replaceAll('_',' ')}{item.meta ? ` · ${item.meta}` : ''}</small>
              </span>
              <small>{new Date(item.createdAt).toLocaleString('de-CH')}</small>
            </div>) : <p className="hsv-empty">Noch keine Aktivität.</p>}
          </div>
        </>}

        {tab === 'team' && <>
          <div className="hsv-rowtop">
            <strong>{teamMembers.length} Teammitglieder</strong>
            {activeWorkspace?.role === 'owner' && <button className="hsv-primary" onClick={() => { setTeamDraft({email:'',role:'member'}); setTeamInviteToken(''); setTeamInviteExpiresAt(''); setTeamOpen(true); }}><Plus size={15}/> Mitglied einladen</button>}
          </div>
          <div className="hsv-intro" style={{marginBottom:18}}>
            <span className="hsv-big-logo"><Users size={26}/></span>
            <div><span>BUSINESS TEAM</span><h2>Rollen & Zugriff</h2><p>Owner verwalten das Team. Admins können Business-Daten verwalten, Accountants Finanzen bearbeiten und Members Projekte/Kunden nutzen.</p></div>
          </div>
          <div className="hsv-table">
            {teamMembers.map((member) => <div key={member.membership_id}>
              <span className="hsv-letter">{(member.display_name || member.email || '?').charAt(0).toUpperCase()}</span>
              <span className="hsv-grow"><strong>{member.display_name || member.email}</strong><small>{member.email} · seit {new Date(member.created_at).toLocaleDateString('de-CH')}</small></span>
              {member.role === 'owner' ? <strong>Owner</strong> : activeWorkspace?.role === 'owner' ? <>
                <select value={member.role} onChange={(e) => void updateTeamRole(member, e.target.value as 'admin'|'member'|'accountant')}>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="accountant">Accountant</option>
                </select>
                <button aria-label="Teammitglied entfernen" onClick={() => void removeTeamMember(member)}><Trash2 size={15}/></button>
              </> : <strong>{member.role}</strong>}
            </div>)}
          </div>
          {activeWorkspace?.role === 'owner' && <>
            <div className="hsv-rowtop" style={{marginTop:24}}><strong>Offene Einladungen</strong></div>
            <div className="hsv-table">
              {teamInvites.filter((invite) => !invite.accepted_at && !invite.revoked_at && new Date(invite.expires_at).getTime() > Date.now()).map((invite) => <div key={invite.invite_id}>
                <span className="hsv-letter"><Mail size={15}/></span>
                <span className="hsv-grow"><strong>{invite.email}</strong><small>{invite.role} · gültig bis {new Date(invite.expires_at).toLocaleDateString('de-CH')}</small></span>
                <button onClick={() => void revokeTeamInvite(invite)}>Widerrufen</button>
              </div>)}
              {!teamInvites.some((invite) => !invite.accepted_at && !invite.revoked_at && new Date(invite.expires_at).getTime() > Date.now()) && <p className="hsv-empty">Keine offenen Team-Einladungen.</p>}
            </div>
            <p className="hsv-warning">Im Dev-Modus wird der Invite-Link noch nicht per E-Mail versendet. Nach dem Erstellen kannst du ihn einmalig kopieren.</p>
          </>}
        </>}

        {tab === 'branding' && settings && <form className="hsv-branding" onSubmit={saveSettings}>
          {settingsMobileView!=='appearance' && <div className="hsv-brand-preview"><span>{settings.logo_url ? <img src={settings.logo_url} alt="Logo"/> : settings.business_name.charAt(0)}</span><div><strong>{settings.business_name}</strong><small>{activeWorkspace?.role} · Dev-Workspace</small></div></div>}
          <div className="hive-mobile-subtabs hive-settings-subtabs" role="tablist" aria-label="Business-Einstellungen">
            <button type="button" role="tab" aria-selected={settingsMobileView==='appearance'} onClick={() => setSettingsMobileView('appearance')}>Erscheinungsbild</button>
            <button type="button" role="tab" aria-selected={settingsMobileView==='brand'} onClick={() => setSettingsMobileView('brand')}>Brand</button>
            <button type="button" role="tab" aria-selected={settingsMobileView==='contact'} onClick={() => setSettingsMobileView('contact')}>Kontakt</button>
            <button type="button" role="tab" aria-selected={settingsMobileView==='billing'} onClick={() => setSettingsMobileView('billing')}>Abrechnung</button>
            <button type="button" role="tab" aria-selected={settingsMobileView==='data'} onClick={() => setSettingsMobileView('data')}>Daten</button>
          </div>
          <section className="hive-settings-section hive-appearance-settings" data-mobile-active={settingsMobileView==='appearance'}><ThemeToggle expanded/></section>
          <section className="hive-settings-section" data-mobile-active={settingsMobileView==='brand'}>
          <label>Business-Name<input autoComplete="organization" value={settings.business_name} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}/></label>
          <label>Rechtlicher Name<input autoComplete="organization" value={settings.legal_name} onChange={(e) => setSettings({ ...settings, legal_name:e.target.value })}/></label>
          <label>Kontaktperson<input autoComplete="name" value={settings.contact_name} onChange={(e) => setSettings({ ...settings, contact_name:e.target.value })}/></label>
          <label>Business-Logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void uploadBusinessLogo(e.target.files?.[0] || null)}/><small>PNG, JPG oder WebP · max. 5 MB</small></label>
          <label>Logo-URL<input value={settings.logo_url} onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })} placeholder="https://…"/></label>
          <label>Accent-Farbe<div className="hsv-color"><input type="color" value={settings.accent_color} onChange={(e) => setSettings({ ...settings, accent_color: e.target.value })}/><span>{settings.accent_color}</span></div></label>
          </section>
          <section className="hive-settings-section" data-mobile-active={settingsMobileView==='contact'}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <label>Kontakt-E-Mail<input type="email" inputMode="email" autoComplete="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })}/></label>
            <label>Telefon<input type="tel" inputMode="tel" autoComplete="tel" value={settings.phone} onChange={(e) => setSettings({ ...settings, phone:e.target.value })}/></label>
          </div>
          <label>Website<input inputMode="url" autoComplete="url" value={settings.website_url} onChange={(e) => setSettings({ ...settings, website_url:e.target.value })} placeholder="https://…"/></label>
          <label>Adresse<input autoComplete="street-address" value={settings.address_line1} onChange={(e) => setSettings({ ...settings, address_line1: e.target.value })}/></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.3fr', gap: 12 }}>
            <label>PLZ<input inputMode="numeric" autoComplete="postal-code" value={settings.postal_code} onChange={(e) => setSettings({ ...settings, postal_code: e.target.value })}/></label>
            <label>Ort<input autoComplete="address-level2" value={settings.city} onChange={(e) => setSettings({ ...settings, city: e.target.value })}/></label>
            <label>Land<input autoComplete="country-name" value={settings.country} onChange={(e) => setSettings({ ...settings, country:e.target.value })}/></label>
          </div>
          </section>
          <section className="hive-settings-section" data-mobile-active={settingsMobileView==='billing'}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <label>UID<input value={settings.uid_number} onChange={(e) => setSettings({ ...settings, uid_number:e.target.value })} placeholder="CHE-…"/></label>
            <label>MWST-Nummer<input value={settings.vat_number} onChange={(e) => setSettings({ ...settings, vat_number:e.target.value })} placeholder="CHE-123.456.789 MWST"/></label>
          </div>
          <label><input type="checkbox" checked={settings.vat_enabled} onChange={(e) => setSettings({ ...settings, vat_enabled:e.target.checked })}/> MWST aktiv</label>
          <label>IBAN<input value={settings.iban} onChange={(e) => setSettings({ ...settings, iban: e.target.value })}/></label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <label>Bank<input value={settings.bank_name} onChange={(e) => setSettings({ ...settings, bank_name:e.target.value })}/></label>
            <label>Kontoinhaber<input value={settings.account_holder} onChange={(e) => setSettings({ ...settings, account_holder:e.target.value })}/></label>
          </div>
          <label>Rechnungs-Absender<input value={settings.invoice_sender_name} onChange={(e) => setSettings({ ...settings, invoice_sender_name:e.target.value })}/></label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <label>Rechnungspräfix<input value={settings.invoice_prefix} onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value.toUpperCase() })}/></label>
            <label>Standard-Fälligkeit Tage<input type="number" min="1" max="180" value={settings.default_due_days} onChange={(e) => setSettings({ ...settings, default_due_days:Number(e.target.value) })}/></label>
            <label>Standard-Steuersatz %<input type="number" min="0" max="100" step="0.1" value={settings.default_tax_rate} onChange={(e) => setSettings({ ...settings, default_tax_rate: Number(e.target.value) })}/></label>
          </div>
          <label><input type="checkbox" checked={settings.invoice_reminders_enabled} onChange={(e) => setSettings({ ...settings, invoice_reminders_enabled:e.target.checked })}/> Automatische Zahlungserinnerungen</label>
          <label>Reminder vor Fälligkeit (Tage)<input type="number" min="1" max="30" value={settings.invoice_reminder_days} onChange={(e) => setSettings({ ...settings, invoice_reminder_days:Number(e.target.value) })}/></label>
          </section>
          {!['appearance','data'].includes(settingsMobileView) && <button className="hsv-primary hive-settings-save" type="submit">Speichern <Check size={15}/></button>}
          {settingsMobileView==='data' && activeWorkspace?.role === 'owner' && activeWorkspace.slug.startsWith('hive-dev-') && <div style={{marginTop:28,paddingTop:22,borderTop:'1px solid rgba(0,0,0,.15)'}}>
            <span className="auth-kicker">Business verwalten</span>
            <p style={{margin:'8px 0 14px'}}>Archivieren entfernt das Business aus dem aktiven Switcher. Die Daten werden nicht gelöscht.</p>
            <button className="hsv-outline" type="button" onClick={() => void archiveBusiness()}><Trash2 size={15}/> Business archivieren</button>
          </div>}
        </form>}
        {tab === 'branding' && settingsMobileView==='data' && activeWorkspace?.role === 'owner' && <BackupCard key={activeWorkspaceId} workspaceId={activeWorkspaceId} name={workspaceLabel(activeWorkspace)}/>}
        </>}
      </main>
    </div>

    <WorkspaceGlassDock
      value={tab === 'overview' || tab === 'customers' || tab === 'projects' ? tab : 'more'}
      onChange={value => {
        setQuickCreateOpen(false);
        if (value === 'more') {
          setMobileMenuOpen(true);
          return;
        }
        setTab(value);
        setMobileMenuOpen(false);
        window.scrollTo({top:0,behavior:'smooth'});
      }}
    />
    {sendConfirmation && <Modal title="Versand bestätigen" onClose={() => { if (!sendConfirmationBusy) setSendConfirmation(null); }} className="hive-send-confirm-dialog">
      <div className="hive-send-confirm-content">
        <span className="hive-send-confirm-symbol"><Mail size={22}/></span>
        <h3>Diese E-Mail wirklich senden?</h3>
        <p>Kontrolliere die Adresse. Erst mit «Jetzt senden» wird die Nachricht verschickt.</p>
        <div className="hive-send-confirm-details">
          <span>Dokument</span><strong>{sendConfirmation.kind === 'invoice' ? `Rechnung ${sendConfirmation.item.invoice_number}` : sendConfirmation.kind === 'offer' ? `Offerte ${sendConfirmation.item.offer_number}` : 'Portal-Einladung'}</strong>
          <span>An</span><strong className="hive-send-confirm-address">{sendConfirmation.recipient.name} · {sendConfirmation.recipient.email}</strong>
          {sendConfirmation.recipient.cc.length > 0 && <><span>CC</span><strong className="hive-send-confirm-address">{sendConfirmation.recipient.cc.join(', ')}</strong></>}
        </div>
        {sendConfirmation.kind === 'portal' && activeWorkspace?.slug.startsWith('hive-dev-') && <small className="hsv-warning">Dev-Modus: Einladung anlegen, ohne E-Mail-Versand.</small>}
        <div className="hive-send-confirm-actions">
          <button type="button" className="hsv-outline" disabled={sendConfirmationBusy} onClick={() => setSendConfirmation(null)}>Abbrechen</button>
          <button type="button" className="hsv-primary" disabled={sendConfirmationBusy} onClick={() => void confirmEmailSend()}><Mail size={15}/>{sendConfirmationBusy ? 'Wird verarbeitet …' : sendConfirmation.kind === 'portal' && activeWorkspace?.slug.startsWith('hive-dev-') ? 'Einladung anlegen' : 'Jetzt senden'}</button>
        </div>
      </div>
    </Modal>}
    {quickCreateOpen && <Modal title="Neu erstellen" onClose={() => setQuickCreateOpen(false)}>
      <div className="hive-mobile-quick-actions">
        <button type="button" onClick={() => { setQuickCreateOpen(false); openCustomer(); }}>
          <span><Users size={19}/></span><div><strong>Kunde</strong><small>Kontakt oder Firma anlegen</small></div><ArrowRight size={15}/>
        </button>
        <button type="button" disabled={!customers.length} onClick={() => { setQuickCreateOpen(false); void openProject(); }}>
          <span><BriefcaseBusiness size={19}/></span><div><strong>Projekt</strong><small>Neues Kundenprojekt starten</small></div><ArrowRight size={15}/>
        </button>
        {canViewFinance && <button type="button" disabled={!customers.length} onClick={() => { setQuickCreateOpen(false); openNewInvoice(); }}>
          <span><CreditCard size={19}/></span><div><strong>Rechnung</strong><small>Entwurf direkt erfassen</small></div><ArrowRight size={15}/>
        </button>}
        {canViewFinance && <button type="button" disabled={!customers.length} onClick={() => { setQuickCreateOpen(false); openNewOffer(); }}>
          <span><FileText size={19}/></span><div><strong>Offerte</strong><small>Angebot für einen Kunden</small></div><ArrowRight size={15}/>
        </button>}
        <button type="button" disabled={!customers.length} onClick={() => { setQuickCreateOpen(false); void openPortalFile(); }}>
          <span><Package size={19}/></span><div><strong>Datei</strong><small>Zum Kundenportal hochladen</small></div><ArrowRight size={15}/>
        </button>
      </div>
    </Modal>}

    {installOpen && <Modal title="Hive auf deinem iPhone" onClose={()=>setInstallOpen(false)}><InstallGuide/></Modal>}

    {mobileMenuOpen && <Modal title="Weitere Bereiche" className="hive-mobile-more-sheet" onClose={() => setMobileMenuOpen(false)}>
      <button className="hive-mobile-new-action" type="button" onClick={() => {setMobileMenuOpen(false);setQuickCreateOpen(true);}}><Plus size={20}/><span>Neu erstellen</span><ArrowRight size={16}/></button>
      <div className="hive-mobile-modules">{nav.filter(([id]) => !['overview','customers','projects'].includes(id)).map(([id,label,Icon]) => <button type="button" key={id} aria-current={tab===id?'page':undefined} onClick={() => {setTab(id);setMobileMenuOpen(false);window.scrollTo({top:0,behavior:'smooth'});}}><Icon size={19}/><span>{label}</span><ArrowRight size={15}/></button>)}</div>
      <div className="hive-mobile-more-footer">
        <button className="hsv-outline" type="button" onClick={()=>{setMobileMenuOpen(false);setInstallOpen(true);}}><Smartphone size={17}/>App installieren</button>
        <a className="hsv-outline" href="/account">Mein Konto <ArrowRight size={16}/></a>
      </div>
    </Modal>}

    {searchOpen && <div className="hsv-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label="Workspace durchsuchen" className="hsv-dialog hive-search-dialog" style={{maxWidth:680,padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 18px',borderBottom:'1px solid rgba(0,0,0,.12)'}}>
          <Search size={18}/>
          <input aria-label="Workspace durchsuchen" autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Kunden, Projekte, Rechnungen, Offerten…" style={{border:0,outline:'none',fontSize:18,width:'100%',background:'transparent'}}/>
          <button type="button" className="hsv-icon" aria-label="Suche schliessen" onClick={() => setSearchOpen(false)}><X size={20}/></button>
        </div>
        <div className="hsv-table" style={{maxHeight:480,overflow:'auto'}}>
          {!searchQuery.trim() && <p className="hsv-empty">Tippen, um im aktuellen Business zu suchen.</p>}
          {searchQuery.trim() && !searchResults.length && <p className="hsv-empty">Keine Treffer.</p>}
          {searchResults.map((result) => <button key={`${result.kind}-${result.id}`} type="button" onClick={() => selectSearchResult(result)} style={{width:'100%',textAlign:'left'}}>
            <span className="hsv-letter">{result.kind === 'customer' ? 'K' : result.kind === 'project' ? 'P' : result.kind === 'invoice' ? 'R' : 'O'}</span>
            <span className="hsv-grow"><strong>{result.label}</strong><small>{result.meta}</small></span>
            <small>{result.kind}</small><ArrowRight size={15}/>
          </button>)}
        </div>
      </div>
    </div>}

    {notice && <div className="hsv-toast" role="status">{notice}<button aria-label="Schliessen" onClick={() => setNotice('')}><X size={16}/></button></div>}

    {businessOpen && <Modal title="Neues Business" onClose={() => setBusinessOpen(false)}>
      <form onSubmit={createBusiness}>
        <label>Name<input required minLength={2} value={businessDraft.name} onChange={(e) => updateBusinessName(e.target.value)} placeholder="z.B. Wedding Vocals"/></label>
        <label>Rechnungspräfix<input required maxLength={12} pattern="[A-Z0-9-]+" value={businessDraft.invoicePrefix} onChange={(e) => setBusinessDraft({ ...businessDraft, invoicePrefix:e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'') })} placeholder="WV"/></label>
        <p className="hsv-warning">Hive erzeugt den technischen Dev-Slug automatisch. Live-Workspaces bleiben unberührt.</p>
        <button className="hsv-primary" type="submit">Business erstellen <Check size={15}/></button>
      </form>
    </Modal>}

    {teamOpen && <Modal title="Teammitglied einladen" onClose={() => setTeamOpen(false)}>
      <form onSubmit={inviteTeamMember}>
        <label>E-Mail<input required type="email" inputMode="email" autoComplete="email" value={teamDraft.email} onChange={(e) => setTeamDraft({ ...teamDraft, email:e.target.value })} placeholder="name@example.com"/></label>
        <label>Rolle<select value={teamDraft.role} onChange={(e) => setTeamDraft({ ...teamDraft, role:e.target.value as 'admin'|'member'|'accountant' })}>
          <option value="member">Member · Projekte & Kunden</option>
          <option value="accountant">Accountant · Finanzen</option>
          <option value="admin">Admin · Business verwalten</option>
        </select></label>
        {!teamInviteToken && <button className="hsv-primary" type="submit">Einladung erstellen <Check size={15}/></button>}
        {teamInviteToken && <div className="hive-team-invite-token">
          <span>INVITE LINK</span>
          <code>{teamInviteToken}</code>
          <button className="hsv-primary" type="button" onClick={() => void copyTeamInvite()}>Link kopieren</button>
          {teamInviteExpiresAt && <small>Gültig bis {new Date(teamInviteExpiresAt).toLocaleString('de-CH')}</small>}
          <small>Der rohe Code wird nicht in der Datenbank gespeichert und nach dem Schliessen nicht erneut angezeigt.</small>
        </div>}
      </form>
    </Modal>}

    {fileOpen && <Modal title="Datei hochladen" onClose={() => setFileOpen(false)}>
      <form onSubmit={uploadPortalFile}>
        <label>Kunde<select required value={fileDraft.customerId} onChange={async (e) => {
          const customerId=e.target.value;
          const items=await loadScopeDepartments(customerId);
          setFileDraft((current) => ({ ...current, customerId, departmentId:preferredDepartmentId(items), projectId:'' }));
        }}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>Abteilung<select required disabled={Boolean(fileDraft.projectId)} value={fileDraft.departmentId} onChange={(e) => setFileDraft({ ...fileDraft, departmentId:e.target.value })}>{scopeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}{department.is_default ? ' · Standard' : ''}</option>)}</select></label>
        <label>Projekt<select value={fileDraft.projectId} onChange={(e) => {
          const projectId=e.target.value;
          const project=projects.find((item) => item.id===projectId);
          setFileDraft({ ...fileDraft, projectId, departmentId:project?.department_id || fileDraft.departmentId });
        }}><option value="">Kein Projekt</option>{projects.filter((project) => project.customer_id === fileDraft.customerId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
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
          <label>Preis CHF<input aria-label="Preis CHF" required type="number" min="0" step="0.01" value={productDraft.unitPrice} onChange={(e) => setProductDraft({ ...productDraft, unitPrice:Number(e.target.value) })}/></label>
          <label>Steuersatz %<input type="number" min="0" max="100" step="0.1" value={productDraft.taxRate} onChange={(e) => setProductDraft({ ...productDraft, taxRate:Number(e.target.value) })}/></label>
        </div>
        <label><input type="checkbox" checked={productDraft.active} onChange={(e) => setProductDraft({ ...productDraft, active:e.target.checked })}/> Aktiv</label>
        <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
      </form>
    </Modal>}

    {projectWorkspaceOpen && projectWorkspace && <div className="hsv-overlay">
      <div className="hsv-invoice-editor" role="dialog" aria-modal="true" aria-label="Workspace Details">
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

    {inviteOpen && sendConfirmation?.kind !== 'portal' && <Modal title="Portal-Einladung" onClose={() => setInviteOpen(false)}>
      <form onSubmit={createPortalInvite}>
        <label>Kunde<select required value={inviteDraft.customerId} onChange={async (e) => {
          const customerId=e.target.value;
          const items=await loadScopeDepartments(customerId);
          const departmentId=preferredDepartmentId(items);
          setInviteDraft((current) => ({ ...current, customerId, departmentId, email:portalInviteAddress(customerId, departmentId, items) }));
        }}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>Abteilung<select required value={inviteDraft.departmentId} onChange={(e) => {
          const departmentId=e.target.value;
          setInviteDraft({ ...inviteDraft, departmentId, email:portalInviteAddress(inviteDraft.customerId, departmentId, scopeDepartments) });
        }}>{scopeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}{department.is_default ? ' · Standard' : ''}</option>)}</select></label>
        <label>E-Mail<input required readOnly type="email" value={inviteDraft.email} placeholder="E-Mail in Kunde/Abteilung hinterlegen"/></label>
        <p className="hsv-warning">{activeWorkspace?.slug.startsWith('hive-dev-')
          ? 'Dev-Modus: Die Einladung wird gespeichert, aber nicht versendet.'
          : 'Live-Versand: Die Einladung geht an die E-Mail-Adresse der ausgewählten Abteilung (oder des Kunden). Zum Ändern die Kontaktadresse beim Kunden bearbeiten.'}</p>
        <button className="hsv-primary" type="submit">{activeWorkspace?.slug.startsWith('hive-dev-') ? 'Einladung anlegen' : 'Einladung senden'} <Check size={15}/></button>
      </form>
    </Modal>}

    {departmentOpen && departmentCustomer && <div className="hsv-overlay">
      <div className="hsv-invoice-editor" role="dialog" aria-modal="true" aria-label="Workspace Details">
        <div className="hsv-editorbar">
          <div><small>KUNDE / ABTEILUNGEN</small><strong>{customerName(departmentCustomer)}</strong></div>
          <button className="hsv-icon" onClick={() => setDepartmentOpen(false)} aria-label="Schliessen"><X size={18}/></button>
        </div>
        <div className="hsv-paper" style={{maxWidth:950}}>
          <div className="hsv-rowtop"><strong>{departments.length} Abteilungen</strong><small>Portal, Dateien und Ansprechpartner pro Department</small></div>
          <div className="hsv-table">
            {departments.map((department) => <div key={department.id}>
              <span className="hsv-letter">{department.name.charAt(0).toUpperCase()}</span>
              <span className="hsv-grow">
                <strong>{department.name}{department.is_default ? ' · Standard' : ''}</strong>
                <small>{department.code || 'Ohne Code'} · {department.contact_email || 'Keine E-Mail'} · {department.active ? 'aktiv' : 'inaktiv'}</small>
              </span>
              <button onClick={() => editDepartment(department)}>Bearbeiten</button>
              {!department.is_default && <button aria-label="Abteilung löschen" onClick={() => void deleteDepartment(department)}><Trash2 size={15}/></button>}
            </div>)}
          </div>

          <form onSubmit={saveDepartment} className="hsv-branding" style={{marginTop:22}}>
            <span className="auth-kicker">{departmentDraft.id ? 'ABTEILUNG BEARBEITEN' : 'NEUE ABTEILUNG'}</span>
            <label>Name<input required minLength={2} value={departmentDraft.name} onChange={(e) => setDepartmentDraft({ ...departmentDraft, name:e.target.value })} placeholder="z.B. Marketing"/></label>
            <label>Code<input value={departmentDraft.code} onChange={(e) => setDepartmentDraft({ ...departmentDraft, code:e.target.value })} placeholder="MKT"/></label>
            <label>Kontaktperson<input value={departmentDraft.contactName} onChange={(e) => setDepartmentDraft({ ...departmentDraft, contactName:e.target.value })}/></label>
            <label>E-Mail<input type="email" value={departmentDraft.contactEmail} onChange={(e) => setDepartmentDraft({ ...departmentDraft, contactEmail:e.target.value })}/></label>
            <label>Telefon<input value={departmentDraft.contactPhone} onChange={(e) => setDepartmentDraft({ ...departmentDraft, contactPhone:e.target.value })}/></label>
            <div style={{display:'flex',gap:18,flexWrap:'wrap'}}>
              <label><input type="checkbox" checked={departmentDraft.isDefault} onChange={(e) => setDepartmentDraft({ ...departmentDraft, isDefault:e.target.checked })}/> Standardabteilung</label>
              <label><input type="checkbox" checked={departmentDraft.active} onChange={(e) => setDepartmentDraft({ ...departmentDraft, active:e.target.checked })}/> Aktiv</label>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
              {departmentDraft.id && <button className="hsv-outline" type="button" onClick={() => setDepartmentDraft({ id:'', name:'', code:'', contactName:'', contactEmail:'', contactPhone:'', isDefault:false, active:true })}>Neu</button>}
            </div>
          </form>
        </div>
      </div>
    </div>}

    {customerWorkspaceOpen && customerWorkspace && <div className="hsv-overlay">
      <div className="hsv-invoice-editor hive-customer-detail" role="dialog" aria-modal="true" aria-label="Workspace Details">
        <div className="hsv-editorbar">
          <div><small>KUNDENAKTE</small><strong>{customerName(customerWorkspace.customer)}</strong></div>
          <button className="hsv-icon" onClick={() => setCustomerWorkspaceOpen(false)} aria-label="Schliessen"><X size={18}/></button>
        </div>
        <div className="hsv-paper" style={{maxWidth:1100}}>
          <div className="hsv-intro" style={{marginBottom:20}}>
            <span className="hsv-big-logo">{customerName(customerWorkspace.customer).charAt(0).toUpperCase()}</span>
            <div>
              <span>KUNDE</span>
              <h2>{customerName(customerWorkspace.customer)}</h2>
              <p>{[customerWorkspace.customer.email,customerWorkspace.customer.phone,[customerWorkspace.customer.postal_code,customerWorkspace.customer.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Keine Kontaktdaten'}</p>
            </div>
          </div>

          <div className="hsv-rowtop" style={{marginBottom:12}}><strong>Kontaktdaten</strong></div>
          <div className="hsv-table" style={{marginBottom:24}}>
            {([
              ['Kontaktperson', customerWorkspace.customer.contact_name],
              ['E-Mail', customerWorkspace.customer.email],
              ['Telefon', customerWorkspace.customer.phone],
              ['Adresse', [
                customerWorkspace.customer.address_line1,
                [customerWorkspace.customer.postal_code, customerWorkspace.customer.city].filter(Boolean).join(' '),
                customerWorkspace.customer.country,
              ].filter(Boolean).join(', ')],
              ['Notizen', customerWorkspace.customer.notes],
            ] as Array<[string,string|null|undefined]>)
              .filter(([,value]) => Boolean(value))
              .map(([label,value]) => <div key={label}>
                <span className="hsv-letter"><Users size={14}/></span>
                <span className="hsv-grow"><strong>{label}</strong><small style={{whiteSpace:'pre-wrap'}}>{value}</small></span>
              </div>)}
          </div>

          <div className="hive-customer-metrics">
            <div><span>AKTIVE PROJEKTE</span><strong>{customerWorkspace.metrics.activeProjectCount}</strong><small>{customerWorkspace.metrics.projectCount} total</small></div>
            {customerWorkspace.canViewFinance && <div><span>OFFEN</span><strong style={{fontSize:22}}>{money(customerWorkspace.metrics.openRappen)}</strong><small>Rechnungen</small></div>}
            {customerWorkspace.canViewFinance && <div><span>BEZAHLT</span><strong style={{fontSize:22}}>{money(customerWorkspace.metrics.paidRappen)}</strong><small>Rechnungswert</small></div>}
            {customerWorkspace.canViewFinance && <div><span>PIPELINE</span><strong style={{fontSize:22}}>{money(customerWorkspace.metrics.offerPipelineRappen)}</strong><small>Offerten</small></div>}
            <div><span>DATEIEN</span><strong>{customerWorkspace.metrics.fileCount}</strong><small>{customerWorkspace.metrics.portalMemberCount} Portal-User</small></div>
          </div>

          <div className="hsv-rowtop" style={{marginTop:30}}><strong>Abteilungen</strong></div>
          <div className="hsv-table">{customerWorkspace.departments.map((department) => <div key={department.id}>
            <span className="hsv-letter">{department.name.charAt(0).toUpperCase()}</span>
            <span className="hsv-grow"><strong>{department.name}{department.is_default ? ' · Standard' : ''}</strong><small>{department.contact_name || 'Keine Kontaktperson'} · {department.contact_email || 'Keine E-Mail'} · {department.active ? 'aktiv' : 'inaktiv'}</small></span>
          </div>)}</div>

          <div className="hsv-rowtop" style={{marginTop:26}}><strong>Projekte</strong></div>
          <div className="hsv-table">{customerWorkspace.projects.length ? customerWorkspace.projects.map((project) => <div key={project.id}>
            <span className="hsv-letter"><BriefcaseBusiness size={15}/></span>
            <span className="hsv-grow"><strong>{project.title}</strong><small>{project.status}{project.due_date ? ` · fällig ${project.due_date}` : ''}</small></span>
            <strong>{money(project.budget_rappen)}</strong>
            <button onClick={() => { setCustomerWorkspaceOpen(false); setTab('projects'); void loadProjectWorkspace(project.id); }}>Öffnen</button>
          </div>) : <p className="hsv-empty">Keine Projekte.</p>}</div>

          {customerWorkspace.canViewFinance && <>
            <div className="hsv-rowtop" style={{marginTop:26}}><strong>Rechnungen</strong></div>
            <div className="hsv-table">{customerWorkspace.invoices.length ? customerWorkspace.invoices.map((invoice) => <div key={invoice.id}>
              <span className="hsv-letter"><CreditCard size={15}/></span>
              <span className="hsv-grow"><strong>{invoice.number_finalized ? invoice.invoice_number : 'Entwurf'}</strong><small>{invoice.status} · fällig {invoice.due_date}</small></span>
              <strong>{money(invoice.total_rappen,invoice.currency)}</strong>
            </div>) : <p className="hsv-empty">Keine Rechnungen.</p>}</div>

            <div className="hsv-rowtop" style={{marginTop:26}}><strong>Offerten</strong></div>
            <div className="hsv-table">{customerWorkspace.offers.length ? customerWorkspace.offers.map((offer) => <div key={offer.id}>
              <span className="hsv-letter"><FileText size={15}/></span>
              <span className="hsv-grow"><strong>{offer.offer_number} · {offer.title}</strong><small>{offer.status} · gültig bis {offer.valid_until}</small></span>
              <strong>{money(offer.total_rappen)}</strong>
            </div>) : <p className="hsv-empty">Keine Offerten.</p>}</div>
          </>}

          <div className="hsv-rowtop" style={{marginTop:26}}><strong>Dateien</strong></div>
          <div className="hsv-table">{customerWorkspace.files.length ? customerWorkspace.files.map((file) => <div key={file.id}>
            <span className="hsv-letter"><FileText size={15}/></span>
            <span className="hsv-grow"><strong>{file.title}</strong><small>{file.original_filename} · {file.kind} · {file.published_at ? 'Portal' : 'intern'}</small></span>
          </div>) : <p className="hsv-empty">Keine Dateien.</p>}</div>

          <div className="hsv-rowtop" style={{marginTop:26}}><strong>Aktivität</strong></div>
          <div className="hsv-table">{customerWorkspace.activity.slice(0,25).map((item) => <div key={item.id}>
            <span className="hsv-letter"><RefreshCw size={14}/></span>
            <span className="hsv-grow"><strong>{item.summary}</strong><small>{item.event_type} · {item.visibility}</small></span>
            <small>{new Date(item.created_at).toLocaleString('de-CH')}</small>
          </div>)}</div>
        </div>
      </div>
    </div>}

    {customerOpen && <Modal title={customerDraft.id ? 'Kunde bearbeiten' : 'Neuer Kunde'} onClose={() => setCustomerOpen(false)}>
      <form onSubmit={saveCustomer}>
        <label>Firma<input autoComplete="organization" value={customerDraft.company} onChange={(e) => setCustomerDraft({ ...customerDraft, company: e.target.value })}/></label>
        <label>Kontaktperson<input autoComplete="name" value={customerDraft.contactName} onChange={(e) => setCustomerDraft({ ...customerDraft, contactName: e.target.value })}/></label>
        <label>E-Mail<input type="email" inputMode="email" autoComplete="email" value={customerDraft.email} onChange={(e) => setCustomerDraft({ ...customerDraft, email: e.target.value })}/></label>
        <label>Telefon<input type="tel" inputMode="tel" autoComplete="tel" value={customerDraft.phone} onChange={(e) => setCustomerDraft({ ...customerDraft, phone: e.target.value })}/></label>
        <label>Adresse<input autoComplete="street-address" value={customerDraft.addressLine1} onChange={(e) => setCustomerDraft({ ...customerDraft, addressLine1: e.target.value })}/></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}><label>PLZ<input inputMode="numeric" autoComplete="postal-code" value={customerDraft.postalCode} onChange={(e) => setCustomerDraft({ ...customerDraft, postalCode: e.target.value })}/></label><label>Ort<input autoComplete="address-level2" value={customerDraft.city} onChange={(e) => setCustomerDraft({ ...customerDraft, city: e.target.value })}/></label></div>
        <label>Land<input autoComplete="country-name" value={customerDraft.country} onChange={(e) => setCustomerDraft({ ...customerDraft, country: e.target.value })}/></label>
        <label>Notiz<textarea rows={3} value={customerDraft.notes} onChange={(e) => setCustomerDraft({ ...customerDraft, notes: e.target.value })}/></label>
        <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
      </form>
    </Modal>}

    {projectOpen && <Modal className="hive-project-dialog" title={projectDraft.id ? 'Projekt bearbeiten' : 'Neues Projekt'} onClose={() => setProjectOpen(false)}>
      <form className="hive-project-form" onSubmit={saveProject}>
        {!projectDraft.id && <>
          <label>Kunde<select required value={projectDraft.customerId} onChange={async (e) => {
            const customerId=e.target.value;
            const items=await loadScopeDepartments(customerId);
            setProjectDraft((current) => ({ ...current, customerId, departmentId:preferredDepartmentId(items) }));
          }}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
          <label>Abteilung<select required value={projectDraft.departmentId} onChange={(e) => setProjectDraft({ ...projectDraft, departmentId:e.target.value })}>{scopeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}{department.is_default ? ' · Standard' : ''}</option>)}</select></label>
        </>}
        <label className="hive-project-form-wide">Projektname<input required value={projectDraft.title} onChange={(e) => setProjectDraft({ ...projectDraft, title: e.target.value })}/></label>
        <label>Status<select value={projectDraft.status} onChange={(e) => setProjectDraft({ ...projectDraft, status: e.target.value as Project['status'] })}><option value="planning">Geplant</option><option value="active">In Arbeit</option><option value="on_hold">Pausiert</option><option value="completed">Abgeschlossen</option></select></label>
        <label>Budget CHF<input type="number" min="0" step="0.01" value={projectDraft.budget} onChange={(e) => setProjectDraft({ ...projectDraft, budget: Number(e.target.value) })}/></label>
        <label className="hive-project-form-wide">Beschreibung<textarea rows={3} value={projectDraft.description} onChange={(e) => setProjectDraft({ ...projectDraft, description: e.target.value })}/></label>
        <div className="hive-project-dates hive-project-form-wide"><label>Start<input type="date" value={projectDraft.startDate} onChange={(e) => setProjectDraft({ ...projectDraft, startDate: e.target.value })}/></label><label>Fällig<input type="date" value={projectDraft.dueDate} onChange={(e) => setProjectDraft({ ...projectDraft, dueDate: e.target.value })}/></label></div>
        <button className="hsv-primary" type="submit">Speichern <Check size={15}/></button>
      </form>
    </Modal>}

    {offerHistoryOpen && offerHistoryOffer && <Modal
      title={offerHistoryOffer.offer_number}
      onClose={() => setOfferHistoryOpen(false)}
    >
      <div className="hive-invoice-history-summary">
        <div><span>Status</span><strong>{stateLabel[offerHistoryOffer.status] || offerHistoryOffer.status}</strong></div>
        <div><span>Betrag</span><strong>{money(offerHistoryOffer.total_rappen)}</strong></div>
        <div><span>Gültig bis</span><strong>{shortDate(offerHistoryOffer.valid_until)}</strong></div>
      </div>
      {offerHistoryInvoice && <div className="hive-history-linked">
        <FileText size={16}/>
        <div>
          <strong>In Rechnung umgewandelt</strong>
          <small>{offerHistoryInvoice.number_finalized ? offerHistoryInvoice.invoice_number : 'Rechnungsentwurf'} · {stateLabel[offerHistoryInvoice.status] || offerHistoryInvoice.status}</small>
        </div>
        <button type="button" onClick={() => { setOfferHistoryOpen(false); setTab('invoices'); }}>Rechnung öffnen</button>
      </div>}
      <div className="hive-invoice-history" aria-busy={offerHistoryBusy}>
        {offerHistoryBusy && <div className="hive-history-loading"><RefreshCw size={16}/><span>Verlauf wird geladen …</span></div>}
        {!offerHistoryBusy && !offerHistoryEvents.length && <p className="hsv-empty">Noch keine Audit-Ereignisse.</p>}
        {!offerHistoryBusy && offerHistoryEvents.map((event) => {
          const label:Record<string,string> = {
            created:'Offerte erstellt',
            updated:'Offerte geändert',
            shared:'Im Kundenportal freigegeben',
            emailed:'Offerte versendet',
            accepted:'Offerte angenommen',
            withdrawn:'Offerte zurückgezogen',
            converted:'In Rechnung umgewandelt',
          };
          const invoiceId = typeof event.details?.invoice_id === 'string' ? event.details.invoice_id : '';
          return <div className={`hive-history-event history-${event.kind}`} key={event.id}>
            <span className="hive-history-dot"/>
            <div>
              <strong>{label[event.kind] || event.kind.replaceAll('_',' ')}</strong>
              <small>{new Date(event.created_at).toLocaleString('de-CH')}</small>
              {invoiceId && <p>Rechnungs-ID: {invoiceId.slice(0,8)}…</p>}
            </div>
          </div>;
        })}
      </div>
      {!!offerSendAttempts.length && <details className="hive-history-tech">
        <summary>Versandtechnik · {offerSendAttempts.length} Versuch{offerSendAttempts.length === 1 ? '' : 'e'}</summary>
        {offerSendAttempts.map((attempt) => <div key={attempt.id}>
          <span>{attempt.state === 'sent' ? 'Erfolgreich' : attempt.state === 'failed' ? 'Fehlgeschlagen' : 'Status wird geprüft'}</span>
          <small>{new Date(attempt.created_at).toLocaleString('de-CH')}{attempt.completed_at ? ` → ${new Date(attempt.completed_at).toLocaleString('de-CH')}` : ' · sicher erneut versuchbar'}</small>
        </div>)}
      </details>}
    </Modal>}

    {invoiceHistoryOpen && invoiceHistoryInvoice && <Modal
      title={invoiceHistoryInvoice.number_finalized ? invoiceHistoryInvoice.invoice_number : 'Rechnungsentwurf'}
      onClose={() => setInvoiceHistoryOpen(false)}
    >
      <div className="hive-invoice-history-summary">
        <div><span>Status</span><strong>{stateLabel[invoiceHistoryInvoice.status] || invoiceHistoryInvoice.status}</strong></div>
        <div><span>Betrag</span><strong>{money(invoiceHistoryInvoice.total_rappen, invoiceHistoryInvoice.currency)}</strong></div>
        <div><span>Fällig</span><strong>{shortDate(invoiceHistoryInvoice.due_date)}</strong></div>
      </div>
      {!invoiceHistoryBusy && invoiceDocumentAudit && <div className="hive-invoice-document-audit">
        <div><FileText size={16}/><span>Persistierter PDF-Snapshot</span></div>
        <strong>v{invoiceDocumentAudit.version} · unveränderlich</strong>
        <small>{invoiceDocumentAudit.filename}</small>
        <small>{(invoiceDocumentAudit.bytes / 1024).toFixed(1)} KB · SHA-256 {invoiceDocumentAudit.sha256.slice(0,12)}… · {new Date(invoiceDocumentAudit.created_at).toLocaleString('de-CH')}</small>
      </div>}
      {!invoiceHistoryBusy && invoiceHistoryInvoice.number_finalized && !invoiceDocumentAudit && <p className="hive-document-pending">PDF-Snapshot wird beim ersten PDF-Download oder Versand dauerhaft erstellt.</p>}
      <div className="hive-invoice-history" aria-busy={invoiceHistoryBusy}>
        {invoiceHistoryBusy && <div className="hive-history-loading"><RefreshCw size={16}/><span>Verlauf wird geladen …</span></div>}
        {!invoiceHistoryBusy && !invoiceHistoryEvents.length && <p className="hsv-empty">Noch keine Audit-Ereignisse.</p>}
        {!invoiceHistoryBusy && invoiceHistoryEvents.map((event) => {
          const label:Record<string,string> = {
            created:'Entwurf erstellt',
            updated:'Entwurf geändert',
            issued:'Rechnung ausgestellt',
            downloaded:'PDF erzeugt',
            sent:'Rechnung versendet',
            resent:'Rechnung erneut versendet',
            paid:'Als bezahlt markiert',
            cancelled:'Rechnung storniert',
            send_failed:'Versand fehlgeschlagen',
            reminder_sent:'Zahlungserinnerung versendet',
          };
          const status = typeof event.details?.status === 'string' ? event.details.status : '';
          const number = typeof event.details?.invoice_number === 'string' ? event.details.invoice_number : '';
          return <div className={`hive-history-event history-${event.kind}`} key={event.id}>
            <span className="hive-history-dot"/>
            <div>
              <strong>{label[event.kind] || event.kind.replaceAll('_',' ')}</strong>
              <small>{new Date(event.created_at).toLocaleString('de-CH')}</small>
              {(event.recipient || status || number) && <p>
                {event.recipient ? `Empfänger: ${event.recipient}` : ''}
                {event.recipient && (status || number) ? ' · ' : ''}
                {number ? number : status ? `Status: ${stateLabel[status] || status}` : ''}
              </p>}
            </div>
          </div>;
        })}
      </div>
      {!!invoiceSendAttempts.length && <details className="hive-history-tech">
        <summary>Versandtechnik · {invoiceSendAttempts.length} Versuch{invoiceSendAttempts.length === 1 ? '' : 'e'}</summary>
        {invoiceSendAttempts.map((attempt) => <div key={attempt.id}>
          <span>{attempt.state === 'sent' ? 'Erfolgreich' : attempt.state === 'failed' ? 'Fehlgeschlagen' : 'Läuft'}</span>
          <small>{new Date(attempt.created_at).toLocaleString('de-CH')}{attempt.completed_at ? ` → ${new Date(attempt.completed_at).toLocaleString('de-CH')}` : ''}</small>
        </div>)}
      </details>}
    </Modal>}

    {invoiceOpen && <DocumentEditor onSubmit={createInvoice} saveLabel={invoiceDraft.id ? 'Änderungen speichern' : 'Rechnungsentwurf erstellen'} title={invoiceDraft.id ? 'Rechnung bearbeiten' : 'Rechnung erstellen'} lines={invoiceDraft.lines} total={invoiceTotal} taxRate={invoiceDraft.taxRate} onClose={() => setInvoiceOpen(false)}
      summaryFields={<label>Steuersatz %<input type="number" min="0" max="100" step="0.1" value={invoiceDraft.taxRate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, taxRate: Number(e.target.value) })}/></label>}
      notes={<label className="hive-document-wide">Notiz<textarea rows={2} value={invoiceDraft.notes} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, notes: e.target.value })}/></label>}
      catalog={products.some((product) => product.active) && <label className="hive-document-wide">Leistung hinzufügen<select defaultValue="" onChange={(e) => { if (e.target.value) addProductToInvoice(e.target.value); e.currentTarget.value=''; }}><option value="">Aus Katalog wählen…</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_rappen)}</option>)}</select></label>}
      onAddLine={() => setInvoiceDraft({ ...invoiceDraft, lines: [...invoiceDraft.lines, { description: '', quantity: 1, unitPrice: 0 }] })}
      onLineChange={(index, line) => setInvoiceDraft({ ...invoiceDraft, lines: invoiceDraft.lines.map((current, i) => i === index ? line : current) })}
      onLineDelete={(index) => setInvoiceDraft({ ...invoiceDraft, lines: invoiceDraft.lines.filter((_, i) => i !== index) })}>
      <>
        <label>Kunde<select required value={invoiceDraft.customerId} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, customerId: e.target.value, projectId: '' })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>Projekt<select value={invoiceDraft.projectId} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, projectId: e.target.value })}><option value="">Kein Projekt</option>{projects.filter((project) => project.customer_id === invoiceDraft.customerId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <div className="hive-document-field-pair"><label>Datum<input required type="date" value={invoiceDraft.issueDate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, issueDate: e.target.value })}/></label><label>Fällig<input required type="date" value={invoiceDraft.dueDate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, dueDate: e.target.value })}/></label></div>
      </>
    </DocumentEditor>}

    {offerOpen && <DocumentEditor onSubmit={createOffer} saveLabel={offerDraft.id ? 'Änderungen speichern' : 'Offertenentwurf erstellen'} title={offerDraft.id ? 'Offerte bearbeiten' : 'Offerte erstellen'} lines={offerDraft.lines} total={offerTotal} taxRate={offerDraft.taxRate} onClose={() => setOfferOpen(false)}
      summaryFields={<label>Steuersatz %<input type="number" min="0" max="100" step="0.1" value={offerDraft.taxRate} onChange={(e) => setOfferDraft({ ...offerDraft, taxRate: Number(e.target.value) })}/></label>}
      notes={<label className="hive-document-wide">Bedingungen<textarea required rows={3} value={offerDraft.terms} onChange={(e) => setOfferDraft({ ...offerDraft, terms: e.target.value })}/></label>}
      catalog={products.some((product) => product.active) && <label className="hive-document-wide">Leistung hinzufügen<select defaultValue="" onChange={(e) => { if (e.target.value) addProductToOffer(e.target.value); e.currentTarget.value=''; }}><option value="">Aus Katalog wählen…</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_rappen)}</option>)}</select></label>}
      onAddLine={() => setOfferDraft({ ...offerDraft, lines: [...offerDraft.lines, { description: '', quantity: 1, unitPrice: 0 }] })}
      onLineChange={(index, line) => setOfferDraft({ ...offerDraft, lines: offerDraft.lines.map((current, i) => i === index ? line : current) })}
      onLineDelete={(index) => setOfferDraft({ ...offerDraft, lines: offerDraft.lines.filter((_, i) => i !== index) })}>
      <>
        <label>Kunde<select required value={offerDraft.customerId} onChange={(e) => setOfferDraft({ ...offerDraft, customerId: e.target.value, projectId: '' })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}</option>)}</select></label>
        <label>Projekt<select value={offerDraft.projectId} onChange={(e) => setOfferDraft({ ...offerDraft, projectId: e.target.value })}><option value="">Kein Projekt</option>{projects.filter((project) => project.customer_id === offerDraft.customerId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <label>Titel<input required value={offerDraft.title} onChange={(e) => setOfferDraft({ ...offerDraft, title: e.target.value })}/></label>
        <div className="hive-document-field-pair"><label>Datum<input type="date" value={offerDraft.issueDate} onChange={(e) => setOfferDraft({ ...offerDraft, issueDate: e.target.value })}/></label><label>Gültig bis<input type="date" value={offerDraft.validUntil} onChange={(e) => setOfferDraft({ ...offerDraft, validUntil: e.target.value })}/></label></div>
      </>
    </DocumentEditor>}
  </div>;
}

function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    const closeOnEscape=(event:KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="hsv-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`hsv-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="hsv-close" aria-label="Schliessen" onClick={onClose}><X size={18}/></button>
      <span>HIVE CRM</span><h2>{title}</h2>{children}
    </div>
  </div>;
}
