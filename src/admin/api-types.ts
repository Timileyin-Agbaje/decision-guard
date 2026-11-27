// Types shared by the admin page resolver and the admin page frontend.

import type { DecisionField } from "../core/validate";

export type AdminResponse<T> =
  | { ok: true; value: T }
  // fieldErrors: one error for each field that is not valid (PRD 10.4).
  | { ok: false; reason: string; fieldErrors?: Partial<Record<DecisionField, string>> };

// The form values that the page sends. terms and paths are comma-separated strings.
export type DecisionForm = {
  title: string;
  statement: string;
  terms: string;
  paths: string;
  sourceUrl: string;
};
