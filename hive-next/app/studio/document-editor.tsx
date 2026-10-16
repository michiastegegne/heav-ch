"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, FileText, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import "./document-editor.css";

type Line = { description: string; quantity: number; unitPrice: number };
type Props = {
  title: string;
  saveLabel: string;
  lines: Line[];
  total: number;
  taxRate: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onClose: () => void;
  onAddLine: () => void;
  onLineChange: (index: number, line: Line) => void;
  onLineDelete: (index: number) => void;
  children: ReactNode;
  notes: ReactNode;
  summaryFields: ReactNode;
  catalog?: ReactNode;
};
const money = (rappen: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(
    rappen / 100,
  );

export default function DocumentEditor({
  title,
  saveLabel,
  lines,
  total,
  taxRate,
  onSubmit,
  onClose,
  onAddLine,
  onLineChange,
  onLineDelete,
  children,
  notes,
  summaryFields,
  catalog,
}: Props) {
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tax = Math.round((total * taxRate) / 100);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    try {
      await onSubmit(event);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  function addLine() {
    onAddLine();
    requestAnimationFrame(() => {
      const fields = formRef.current?.querySelectorAll<HTMLInputElement>(
        '.hive-document-line input[type="text"]',
      );
      fields?.[fields.length - 1]?.focus();
    });
  }
  return (
    <div className="hsv-overlay hive-document-overlay">
      <section
        className="hive-document"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="hive-document-header">
          <span className="hive-document-symbol">
            <FileText size={22} />
          </span>
          <div>
            <span className="hive-document-eyebrow">
              DOKUMENTE <span>/</span> ENTWURF
            </span>
            <h1>{title}</h1>
          </div>
          <button
            className="hive-document-close"
            type="button"
            aria-label="Schliessen"
            disabled={saving}
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        <form ref={formRef} className="hive-document-form" onSubmit={submit}>
          <div className="hive-document-scroll">
            <div className="hive-document-grid">
              <div className="hive-document-main">
                <section className="hive-document-section">
                  <header>
                    <span className="hive-document-step">01</span>
                    <div>
                      <h2>Empfänger & Details</h2>
                      <p>Die wichtigsten Angaben für dein Dokument.</p>
                    </div>
                  </header>
                  <div className="hive-document-fields">{children}</div>
                </section>
                <section className="hive-document-section hive-document-items">
                  <header>
                    <span className="hive-document-step">02</span>
                    <div>
                      <h2>Leistungen</h2>
                      <p>Beschreibe deine Arbeit und lege den Preis fest.</p>
                    </div>
                    <span className="hive-document-count">{lines.length}</span>
                  </header>
                  {catalog && (
                    <div className="hive-document-catalog">{catalog}</div>
                  )}
                  <div className="hive-document-lines">
                    {lines.map((line, index) => (
                      <div className="hive-document-line" key={index}>
                        <div className="hive-document-line-heading">
                          <span>
                            POSITION {String(index + 1).padStart(2, "0")}
                          </span>
                          <button
                            type="button"
                            aria-label={`Position ${index + 1} löschen`}
                            disabled={lines.length === 1 || saving}
                            onClick={() => onLineDelete(index)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <label className="hive-document-description">
                          Leistung
                          <input
                            type="text"
                            aria-label={`Position ${index + 1}: Beschreibung`}
                            required
                            maxLength={2000}
                            value={line.description}
                            placeholder="z. B. Konzeption und Umsetzung"
                            onChange={(e) =>
                              onLineChange(index, {
                                ...line,
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Menge
                          <input
                            aria-label={`Position ${index + 1}: Menge`}
                            type="number"
                            inputMode="decimal"
                            required
                            min="0.01"
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) =>
                              onLineChange(index, {
                                ...line,
                                quantity: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          CHF / Einheit
                          <input
                            aria-label={`Position ${index + 1}: Preis pro Einheit in CHF`}
                            type="number"
                            inputMode="decimal"
                            required
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) =>
                              onLineChange(index, {
                                ...line,
                                unitPrice: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <div className="hive-document-line-total">
                          <span>Betrag</span>
                          <strong>
                            {money(
                              Math.round(line.quantity * line.unitPrice * 100),
                            )}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="hive-document-add"
                    type="button"
                    onClick={addLine}
                    disabled={saving}
                  >
                    <Plus size={17} /> Position hinzufügen
                  </button>
                </section>
              </div>
              <aside
                className="hive-document-summary"
                aria-label="Zusammenfassung"
              >
                <span className="hive-document-eyebrow">DEIN DOKUMENT</span>
                <h2>Zusammenfassung</h2>
                <div className="hive-document-summary-fields">
                  {summaryFields}
                </div>
                <dl>
                  <div>
                    <dt>
                      {lines.length}{" "}
                      {lines.length === 1 ? "Position" : "Positionen"}
                    </dt>
                    <dd>{money(total)}</dd>
                  </div>
                  <div>
                    <dt>Steuern ({taxRate} %)</dt>
                    <dd>{money(tax)}</dd>
                  </div>
                  <div className="hive-document-grand">
                    <dt>Gesamtbetrag</dt>
                    <dd>{money(total + tax)}</dd>
                  </div>
                </dl>
                <p>
                  <span className="hive-document-draft-dot" />
                  Wird als Entwurf gespeichert.
                </p>
                <small>
                  Du kannst das Dokument danach prüfen und ausstellen.
                </small>
              </aside>
            </div>
          </div>
          <footer className="hive-document-footer">
            <div className="hive-document-footer-total">
              <span>Gesamt inkl. Steuern</span>
              <strong>{money(total + tax)}</strong>
            </div>
            <button
              className="hive-document-cancel"
              type="button"
              disabled={saving}
              onClick={onClose}
            >
              Abbrechen
            </button>
            <button
              className="hive-document-save"
              type="submit"
              disabled={saving}
            >
              {saving ? (
                <LoaderCircle className="hive-document-spinner" size={17} />
              ) : (
                <Check size={17} />
              )}
              <span>{saving ? "Wird gespeichert …" : saveLabel}</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
