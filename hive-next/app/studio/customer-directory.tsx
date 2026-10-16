"use client";

import {
  ArrowUpRight,
  Building2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Customer = {
  id: string;
  company: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  city: string | null;
};
type Props<T extends Customer> = {
  customers: T[];
  total: number;
  query: string;
  onQuery: (query: string) => void;
  onCreate: () => void;
  onOpen: (customer: T) => void;
  onEdit: (customer: T) => void;
  onDepartments: (customer: T) => void;
  onDelete: (customer: T) => void;
};
const label = (customer: Customer) =>
  customer.company || customer.contact_name || "Unbenannter Kunde";

export default function CustomerDirectory<T extends Customer>({
  customers,
  total,
  query,
  onQuery,
  onCreate,
  onOpen,
  onEdit,
  onDepartments,
  onDelete,
}: Props<T>) {
  function actions(customer: T) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Aktionen für ${label(customer)}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="crm-menu w-52">
          <DropdownMenuItem onSelect={() => onEdit(customer)}>
            <Pencil />
            Bearbeiten
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDepartments(customer)}>
            <Building2 />
            Abteilungen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete(customer)}
          >
            <Trash2 />
            Kunde löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  function identity(customer: T) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-semibold">
          {label(customer).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <button
            className="block max-w-full truncate border-0 bg-transparent p-0 text-left text-sm font-semibold text-foreground hover:underline"
            onClick={() => onOpen(customer)}
          >
            {label(customer)}
          </button>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {customer.contact_name || "Keine Kontaktperson"}
          </p>
        </div>
      </div>
    );
  }
  return (
    <section className="crm-ui space-y-5" aria-label="Kundenverzeichnis">
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="gap-4 border-b p-5 sm:flex sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="space-y-2">
            <CardTitle className="text-base">
              Deine Kunden{" "}
              <span className="ml-2 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {total}
              </span>
            </CardTitle>
            <CardDescription>
              Kontakte und gemeinsame Projekte im Überblick.
            </CardDescription>
          </div>
          <Button className="h-11 w-full sm:w-auto" onClick={onCreate}>
            <Plus />
            Kunde hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex items-center gap-3 border-b px-5 py-4 sm:px-6">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input
                className="h-11 pl-10 pr-12"
                aria-label="Liste durchsuchen"
                placeholder="Name, E-Mail oder Ort suchen …"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="absolute right-0 top-0"
                  aria-label="Suche leeren"
                  onClick={() => onQuery("")}
                >
                  <X />
                </Button>
              )}
            </div>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
              {customers.length} Ergebnisse
            </span>
          </div>
          {customers.length ? (
            <>
              <div className="crm-customer-table">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-6">Kunde</TableHead>
                      <TableHead>Kontakt</TableHead>
                      <TableHead>Standort</TableHead>
                      <TableHead className="pr-6 text-right">
                        Aktionen
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="max-w-72 py-5 pl-6">
                          {identity(customer)}
                        </TableCell>
                        <TableCell className="crm-contact-cell text-muted-foreground">
                          {customer.email ? (
                            <a
                              className="hover:text-foreground hover:underline"
                              href={`mailto:${customer.email}`}
                            >
                              {customer.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="crm-place-cell text-muted-foreground">
                          {[customer.postal_code, customer.city]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </TableCell>
                        <TableCell className="crm-action-cell pr-4">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              className="h-11"
                              onClick={() => onOpen(customer)}
                            >
                              Kundenakte
                              <ArrowUpRight />
                            </Button>
                            {actions(customer)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl border bg-muted">
                <Users className="size-5" />
              </span>
              <h2 className="text-base font-semibold">
                {query ? "Keine passenden Kunden" : "Dein erster Kunde"}
              </h2>
              <p className="max-w-xs text-sm text-muted-foreground">
                {query
                  ? "Versuche einen anderen Namen, eine E-Mail oder einen Ort."
                  : "Lege einen Kontakt an. Projekte und Dokumente bleiben in seiner Kundenakte zusammen."}
              </p>
              <Button
                variant="outline"
                className="mt-2 h-11"
                onClick={query ? () => onQuery("") : onCreate}
              >
                {query ? "Suche zurücksetzen" : "Kunde hinzufügen"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
