"use client";

import {
  ArrowUpRight,
  Building2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  contact_email?: string | null;
  billing_contact_name?: string | null;
  billing_email?: string | null;
  address_line1?: string | null;
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
      <div className="hive-project-identity">
        <span className="hsv-letter">
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
    <section className="hive-customer-directory" aria-label="Kundenverzeichnis">
      <div className="hive-list-tools">
        <label><Search size={15}/><input aria-label="Liste durchsuchen" placeholder="Suchen nach Firma, Kontakt oder Ort …" value={query} onChange={event=>onQuery(event.target.value)}/>
          {query && <button type="button" aria-label="Suche leeren" onClick={()=>onQuery('')}><X size={13}/></button>}
        </label><span>{customers.length} von {total} Kunden</span>
      </div>
      <div className="hsv-rowtop hive-directory-count"><strong>{total} Kunden</strong></div>
      <div className="hsv-table hive-customer-list">
        {customers.map(customer=><div className="hive-customer-row" key={customer.id}>
          {identity(customer)}
          <div className="hive-customer-contacts">
            {customer.contact_email && <a href={`mailto:${customer.contact_email}`}><small>Ansprechpartner</small>{customer.contact_email}</a>}
            {customer.billing_email && <a href={`mailto:${customer.billing_email}`}><small>Buchhaltung · {customer.billing_contact_name}</small>{customer.billing_email}</a>}
            {!customer.contact_email && !customer.billing_email && <span><small>E-Mail</small>{customer.email || '—'}</span>}
            {customer.phone && <a href={`tel:${customer.phone.replace(/[^+\d]/g,'')}`}>{customer.phone}</a>}
          </div>
          <div className="hive-customer-place"><span>{[customer.postal_code,customer.city].filter(Boolean).join(' ') || '—'}</span>{customer.address_line1 && <small>{customer.address_line1}</small>}</div>
          <div className="hive-record-actions"><button onClick={()=>onOpen(customer)}>Kundenakte <ArrowUpRight size={14}/></button>{actions(customer)}</div>
        </div>)}
        {!customers.length && <div className="hive-no-results"><Users size={20}/><h2>{query?'Keine passenden Kunden':'Dein erster Kunde'}</h2><p>{query?'Versuche einen anderen Namen, eine E-Mail oder einen Ort.':'Kunden, Projekte und Dokumente an einem Ort.'}</p><Button variant="outline" onClick={query?()=>onQuery(''):onCreate}>{query?'Suche zurücksetzen':'Kunde hinzufügen'}</Button></div>}
      </div>
    </section>
  );
}
