"use client";

import { ArrowUpRight, CalendarDays, GripVertical, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ProjectCard = {
  id: string;
  title: string;
  status: "planning" | "active" | "completed" | "on_hold";
  budget_rappen: number;
  due_date: string | null;
  customers?: { company?: string | null; contact_name?: string | null } | null;
};
const columns: Array<{ id: ProjectCard["status"]; label: string }> = [
  { id: "planning", label: "Geplant" },
  { id: "active", label: "In Arbeit" },
  { id: "on_hold", label: "Pausiert" },
  { id: "completed", label: "Abgeschlossen" },
];
const customer = (project: ProjectCard) =>
  project.customers?.company?.trim() ||
  project.customers?.contact_name?.trim() ||
  "Kunde";
const money = (value: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(
    (Number(value) || 0) / 100,
  );
const date = (value: string) =>
  new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "short" }).format(
    new Date(value + "T12:00:00"),
  );

export default function ProjectBoard({
  projects,
  onStatus,
  onOpen,
  onEdit,
}: {
  projects: ProjectCard[];
  onStatus: (project: ProjectCard, status: ProjectCard["status"]) => void;
  onOpen: (id: string) => void;
  onEdit: (project: ProjectCard) => void;
}) {
  const [dragged, setDragged] = useState("");
  const [over, setOver] = useState("");
  return (
    <div className="crm-ui hive-project-board hive-clean-board">
      {columns.map((column) => {
        const items = projects.filter(
          (project) => project.status === column.id,
        );
        return (
          <section
            key={column.id}
            className="hive-project-column"
            data-status={column.id}
            data-drag-over={over === column.id}
            aria-label={column.label}
            onDragOver={(event) => {
              if (dragged) {
                event.preventDefault();
                setOver(column.id);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setOver("");
            }}
            onDrop={(event) => {
              event.preventDefault();
              const project = projects.find((item) => item.id === dragged);
              if (project && project.status !== column.id)
                onStatus(project, column.id);
              setDragged("");
              setOver("");
            }}
          >
            <header>
              <div>
                <span
                  className="hive-board-status-dot"
                  data-status-tone={column.id}
                />
                <strong>{column.label}</strong>
                <span className="hive-board-count">{items.length}</span>
              </div>
              <GripVertical size={15} aria-hidden="true" />
            </header>
            <div className="hive-project-column-body">
              {items.map((project) => (
                <Card
                  key={project.id}
                  className="hive-clean-project-card gap-0 overflow-hidden py-0 shadow-none"
                  data-dragging={dragged === project.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", project.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDragged(project.id);
                  }}
                  onDragEnd={() => {
                    setDragged("");
                    setOver("");
                  }}
                >
                  <CardContent className="space-y-5 p-4">
                    <div className="space-y-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {customer(project)}
                      </p>
                      <button
                        className="group flex w-full items-start justify-between gap-3 border-0 bg-transparent p-0 text-left text-sm font-semibold leading-relaxed text-foreground"
                        onClick={() => onOpen(project.id)}
                      >
                        <span className="min-w-0 break-words">
                          {project.title}
                        </span>
                        <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {project.due_date
                          ? date(project.due_date)
                          : "Ohne Termin"}
                      </span>
                      <span className="font-medium tabular-nums">
                        {money(project.budget_rappen)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t pt-3">
                      <select
                        className="hive-board-status-select"
                        data-status-tone={project.status}
                        aria-label={`Status für ${project.title}`}
                        value={project.status}
                        onChange={(event) =>
                          onStatus(
                            project,
                            event.target.value as ProjectCard["status"],
                          )
                        }
                      >
                        {columns.map((option) => (
                          <option value={option.id} key={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`${project.title} bearbeiten`}
                        onClick={() => onEdit(project)}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!items.length && (
                <div className="hive-project-column-empty">
                  {dragged ? "Hier ablegen" : "Noch keine Projekte"}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
