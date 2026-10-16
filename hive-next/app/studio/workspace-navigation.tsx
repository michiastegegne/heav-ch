"use client";

import type { LucideIcon } from "lucide-react";
import { ShieldCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

// Composition adapted from the official shadcn sidebar-10 (MIT), with Hive's
// real modules and roles in place of the template's sample pages and teams.
export default function WorkspaceNavigation<T extends string>({
  items,
  active,
  onSelect,
  customerCount,
}: {
  items: readonly (readonly [T, string, LucideIcon])[];
  active: T;
  onSelect: (id: T) => void;
  customerCount: number;
}) {
  const groups = [
    {
      label: "Workspace",
      items: items.filter(([id]) =>
        ["businesses", "overview", "customers", "projects"].includes(id),
      ),
    },
    {
      label: "Finanzen",
      items: items.filter(([id]) =>
        ["invoices", "offers", "catalog"].includes(id),
      ),
    },
    {
      label: "Zusammenarbeit",
      items: items.filter(([id]) =>
        ["emails", "portal", "activity"].includes(id),
      ),
    },
    {
      label: "Verwaltung",
      items: items.filter(([id]) => ["team", "branding"].includes(id)),
    },
  ];
  return (
    <nav
      className="hsv-nav hive-notion-sidebar crm-ui"
      aria-label="Business-Module"
    >
      <SidebarProvider className="min-h-0 w-full">
        <Sidebar collapsible="none" className="w-full bg-transparent">
          <SidebarContent className="gap-3">
            {groups
              .filter((group) => group.items.length)
              .map((group) => (
                <SidebarGroup key={group.label} className="px-0">
                  <SidebarGroupLabel className="h-7 px-3 text-xs font-medium">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-0.5">
                      {group.items.map(([id, label, Icon]) => (
                        <SidebarMenuItem key={id}>
                          <SidebarMenuButton
                            className={active === id ? "on" : ""}
                            isActive={active === id}
                            aria-current={active === id ? "page" : undefined}
                            onClick={() => onSelect(id)}
                          >
                            <Icon />
                            <span>{label}</span>
                          </SidebarMenuButton>
                          {id === "customers" && customerCount > 0 && (
                            <SidebarMenuBadge aria-hidden="true">
                              {customerCount}
                            </SidebarMenuBadge>
                          )}
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
          </SidebarContent>
          <SidebarFooter className="px-3 py-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              <span>Geschützter Workspace</span>
            </div>
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    </nav>
  );
}
