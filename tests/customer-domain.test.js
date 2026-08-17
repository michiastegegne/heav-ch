import test from "node:test";
import assert from "node:assert/strict";
import { validateCustomer } from "../admin/assets/domain.js";

test("Kunden können ohne Firma mit einer Kontaktperson angelegt werden", () => {
  assert.deepEqual(validateCustomer({ company: "", contactName: "Noah Frei" }), {});
});

test("Kunden dürfen ohne Adresse, Telefon oder E-Mail angelegt werden", () => {
  assert.deepEqual(validateCustomer({ company: "Atelier Morgen", contactName: "", email: "", phone: "", address: "", postalCode: "", city: "" }), {});
});

test("Kunden brauchen mindestens Firma oder Kontaktperson", () => {
  assert.deepEqual(validateCustomer({ company: "", contactName: "" }), {
    identity: "Bitte eine Firma oder Kontaktperson angeben.",
  });
});

test("Eine optionale Kunden-E-Mail wird trotzdem validiert, wenn sie ausgefüllt ist", () => {
  assert.deepEqual(validateCustomer({ company: "Atelier Morgen", email: "keine-email" }), {
    email: "Bitte eine gültige E-Mail-Adresse angeben.",
  });
});
