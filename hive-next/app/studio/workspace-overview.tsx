import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  FileText,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  due_date: string;
  total_rappen: number;
  currency: string;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type Project = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
type Activity = {
  id: string;
  summary: string;
  createdAt: string;
  source: string;
};
type Props = {
  invoices: Invoice[];
  projects: Project[];
  customerCount: number;
  offerCount: number;
  activity: Activity[];
  canViewFinance: boolean;
  onNavigate: (
    tab: "invoices" | "projects" | "customers" | "offers" | "activity",
  ) => void;
  onProject: (id: string) => void;
  onCreateProject: () => void;
};
const money = (value: number, currency = "CHF") =>
  new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
const name = (item: {
  customers?: { company?: string | null; contact_name?: string | null } | null;
}) => item.customers?.company || item.customers?.contact_name || "Kunde";
const date = (value: string) =>
  new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "short" }).format(
    new Date(value + "T12:00:00"),
  );
const statusText: Record<string, string> = {
  planning: "Geplant",
  active: "In Arbeit",
  on_hold: "Pausiert",
  completed: "Abgeschlossen",
  overdue: "Überfällig",
  sent: "Offen",
  draft: "Entwurf",
  paid: "Bezahlt",
  cancelled: "Storniert",
};

// Card composition follows shadcn dashboard-01/section-cards; values are live CRM data.
export default function WorkspaceOverview({
  invoices,
  projects,
  customerCount,
  offerCount,
  activity,
  canViewFinance,
  onNavigate,
  onProject,
  onCreateProject,
}: Props) {
  const open = invoices.filter(
    (invoice) => invoice.status === "sent" || invoice.status === "overdue",
  );
  const outstanding = open.reduce(
    (sum, invoice) => sum + Number(invoice.total_rappen),
    0,
  );
  const overdue = open.filter((invoice) => invoice.status === "overdue");
  const active = projects.filter(
    (project) => project.status === "active" || project.status === "planning",
  );
  const paid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + Number(invoice.total_rappen), 0);
  const nextProjects = [...active]
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .slice(0, 5);
  const nextInvoices = [...open]
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 4);
  const metrics = [
    ...(canViewFinance
      ? [
          {
            label: "Offene Forderungen",
            value: money(outstanding),
            note: overdue.length
              ? `${overdue.length} ${overdue.length === 1 ? "Rechnung" : "Rechnungen"} überfällig`
              : "Keine überfälligen Rechnungen",
            icon: Wallet,
            tab: "invoices" as const,
          },
          {
            label: "Zahlungseingänge",
            value: money(paid),
            note: "Bezahlte Rechnungen · gesamt",
            icon: Check,
            tab: "invoices" as const,
          },
        ]
      : []),
    {
      label: "Laufende Projekte",
      value: String(active.length),
      note: `${projects.length} Projekte insgesamt`,
      icon: BriefcaseBusiness,
      tab: "projects" as const,
    },
    {
      label: "Kunden",
      value: String(customerCount),
      note: canViewFinance
        ? `${offerCount} offene Offerten`
        : "Kontakte im Workspace",
      icon: Users,
      tab: "customers" as const,
    },
  ];
  return (
    <div className="crm-ui hive-overview space-y-6">
      <section
        className="crm-metrics grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Business-Kennzahlen"
      >
        {metrics.map((metric) => (
          <button
            key={metric.label}
            data-tone={metric.tab === "invoices" ? (metric.label === "Zahlungseingänge" ? "mint" : "peach") : metric.tab === "projects" ? "lilac" : "blue"}
            onClick={() => onNavigate(metric.tab)}
            className="group min-w-0 rounded-xl border-0 bg-transparent p-0 text-left outline-offset-4 focus-visible:outline-2"
          >
            <Card className="h-full gap-5 shadow-none transition-colors group-hover:border-ring/50">
              <CardHeader className="gap-4 px-5">
                <CardDescription className="flex items-center justify-between gap-2">
                  {metric.label}
                  <metric.icon className="size-4" />
                </CardDescription>
                <CardTitle className="hive-kpi-value whitespace-nowrap text-[clamp(1.5rem,2.2vw,2rem)] font-semibold tracking-tight tabular-nums">
                  {metric.tab === "invoices" ? (
                    <>
                      <span className="hive-metric-currency">CHF</span>
                      <span>{metric.value.replace(/^CHF\s*/, "")}</span>
                    </>
                  ) : (
                    metric.value
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2 px-5 text-xs text-muted-foreground">
                <span>{metric.note}</span>
                <ArrowUpRight className="size-4" />
              </CardContent>
            </Card>
          </button>
        ))}
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b p-5 sm:p-6">
              <div className="space-y-2">
                <CardTitle className="text-base">Projekte im Fokus</CardTitle>
                <CardDescription>
                  Die nächsten Schritte deiner laufenden Arbeit.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Alle Projekte"
                onClick={() => onNavigate("projects")}
              >
                <ArrowRight />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {nextProjects.length ? (
                <div className="divide-y divide-border">
                  {nextProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => onProject(project.id)}
                      className="flex w-full items-center gap-3 border-0 bg-transparent px-5 py-5 text-left hover:bg-muted/50 sm:px-6"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
                        <BriefcaseBusiness className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-medium">
                          {project.title}
                        </strong>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {name(project)}
                          {project.due_date
                            ? ` · ${date(project.due_date)}`
                            : ""}
                        </span>
                      </span>
                      <Badge
                        data-status-tone={project.status}
                        variant="outline"
                        className="hidden sm:inline-flex"
                      >
                        {statusText[project.status] || project.status}
                      </Badge>
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 p-8 text-center">
                  <BriefcaseBusiness className="mx-auto size-6 text-muted-foreground" />
                  <h2 className="text-sm font-medium">
                    Keine laufenden Projekte
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Neue Arbeit beginnt mit einem Kundenprojekt.
                  </p>
                  <Button
                    className="h-11"
                    disabled={!customerCount}
                    onClick={onCreateProject}
                  >
                    Projekt anlegen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          {canViewFinance && (
            <Card className="gap-0 overflow-hidden py-0 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between border-b p-5 sm:p-6">
                <div className="space-y-2">
                  <CardTitle className="text-base">Offene Rechnungen</CardTitle>
                  <CardDescription>
                    {open.length} offen · {money(outstanding)}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Alle Rechnungen"
                  onClick={() => onNavigate("invoices")}
                >
                  <ArrowRight />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {nextInvoices.length ? (
                  <div className="divide-y divide-border">
                    {nextInvoices.map((invoice) => (
                      <button
                        key={invoice.id}
                        onClick={() => onNavigate("invoices")}
                        className="flex w-full items-center gap-3 border-0 bg-transparent px-5 py-5 text-left hover:bg-muted/50 sm:px-6"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border">
                          <FileText className="size-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-medium">
                            {name(invoice)}
                          </strong>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {invoice.invoice_number} · {date(invoice.due_date)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <strong className="block text-sm font-medium tabular-nums">
                            {money(invoice.total_rappen, invoice.currency)}
                          </strong>
                          <span
                            className={`mt-1 block text-xs ${invoice.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            {statusText[invoice.status]}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                    <Check className="size-5" />
                    Alles ausgeglichen. Keine offenen Rechnungen.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <aside className="space-y-6">
          {canViewFinance && overdue.length > 0 && (
            <Card className="gap-4 border-amber-500/30 bg-amber-500/5 shadow-none">
              <CardHeader className="gap-3">
                <Clock3 className="size-5 text-amber-600" />
                <CardTitle className="text-base">Zahlungen prüfen</CardTitle>
                <CardDescription>
                  {overdue.length}{" "}
                  {overdue.length === 1 ? "Rechnung ist" : "Rechnungen sind"}{" "}
                  überfällig. Prüfe die Eingänge, bevor du nachfasst.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => onNavigate("invoices")}
                >
                  Rechnungen ansehen
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          )}
          <Card className="gap-5 shadow-none">
            <CardHeader className="gap-2">
              <CardTitle className="text-base">Zuletzt passiert</CardTitle>
              <CardDescription>Aktuelles aus deinem Workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {activity.length ? (
                <ol className="m-0 list-none space-y-5 p-0">
                  {activity.slice(0, 5).map((item) => (
                    <li key={item.id} className="flex items-start gap-3">
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                      <div className="min-w-0 space-y-2">
                        <p className="text-sm leading-relaxed">
                          {item.summary}
                        </p>
                        <time
                          className="block text-xs text-muted-foreground"
                          dateTime={item.createdAt}
                        >
                          {new Intl.DateTimeFormat("de-CH", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(item.createdAt))}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Hier erscheinen neue Änderungen.
                </p>
              )}
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={() => onNavigate("activity")}
              >
                Gesamter Verlauf
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
