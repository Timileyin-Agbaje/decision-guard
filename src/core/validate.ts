// Input validation from PRD sections 9.1, 10.1 and 11 (HR-3, HR-4).
// Each function returns only the first error, in a fixed sequence. It never throws for bad input.

import { normalizeList, normalizePath, normalizeTerm, parseList } from "./normalize";
import type { Result } from "./result";
import type { DecisionInput, Plan } from "./types";

export const PATH_NOT_RELATIVE = "Paths must be relative to the repository root.";
export const PATH_HAS_DOT_DOT = "Paths must not contain '..'.";

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-[0-9]+$/;

type Fields = Record<string, unknown>;

type ListLimits = {
  // Maximum length of the raw string before the split. Undefined: no raw limit.
  maxRawLength?: number;
  maxItemLength: number;
  maxCount: number;
};

function isFields(input: unknown): input is Fields {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

// Reads a required text field. Removes spaces at the start and end, then checks the length.
function readText(fields: Fields, name: string, maxLength: number): Result<string> {
  const value = fields[name];
  if (value === undefined || value === null) {
    return { ok: false, reason: `${name} is required.` };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: `${name} must be a string.` };
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > maxLength) {
    return { ok: false, reason: `${name} must be 1 to ${maxLength} characters.` };
  }
  return { ok: true, value: trimmed };
}

// Reads an optional string field. Missing, null and "" all mean "not supplied".
function readOptionalString(fields: Fields, name: string): Result<string | undefined> {
  const value = fields[name];
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: `${name} must be a string.` };
  }
  return { ok: true, value };
}

function checkRawLength(raw: string, name: string, limits: ListLimits): Result<string> {
  if (limits.maxRawLength !== undefined && raw.length > limits.maxRawLength) {
    return {
      ok: false,
      reason: `${name} must be ${limits.maxRawLength.toLocaleString("en-US")} characters or less.`,
    };
  }
  return { ok: true, value: raw };
}

function checkCount(items: string[], name: string, maxCount: number): Result<string[]> {
  if (items.length > maxCount) {
    return { ok: false, reason: `${name} must have ${maxCount} items or less.` };
  }
  return { ok: true, value: items };
}

function readTerms(fields: Fields, limits: ListLimits): Result<string[]> {
  const raw = readOptionalString(fields, "terms");
  if (!raw.ok) {
    return raw;
  }
  if (raw.value === undefined) {
    return { ok: true, value: [] };
  }
  const rawCheck = checkRawLength(raw.value, "terms", limits);
  if (!rawCheck.ok) {
    return rawCheck;
  }
  const normalized = parseList(raw.value).map(normalizeTerm);
  for (const term of normalized) {
    if (term.length > limits.maxItemLength) {
      return { ok: false, reason: `Each term must be 1 to ${limits.maxItemLength} characters.` };
    }
  }
  return checkCount(normalizeList(normalized), "terms", limits.maxCount);
}

// Absolute: starts with "/", "~" or a drive letter. The check runs before normalization removes
// a "/" at the end, so that the input "/" gives an error and is not removed as an empty item.
function isAbsolute(path: string): boolean {
  const prepared = path.normalize("NFC").trim().replace(/\\/g, "/");
  return prepared.startsWith("/") || prepared.startsWith("~") || /^[A-Za-z]:/.test(prepared);
}

function readPaths(fields: Fields, limits: ListLimits): Result<string[]> {
  const raw = readOptionalString(fields, "paths");
  if (!raw.ok) {
    return raw;
  }
  if (raw.value === undefined) {
    return { ok: true, value: [] };
  }
  const rawCheck = checkRawLength(raw.value, "paths", limits);
  if (!rawCheck.ok) {
    return rawCheck;
  }
  const normalized: string[] = [];
  // For each path, in input order: relative, then "..", then length.
  for (const item of parseList(raw.value)) {
    if (isAbsolute(item)) {
      return { ok: false, reason: PATH_NOT_RELATIVE };
    }
    const path = normalizePath(item);
    if (path.split("/").includes("..")) {
      return { ok: false, reason: PATH_HAS_DOT_DOT };
    }
    if (path.length > limits.maxItemLength) {
      return { ok: false, reason: `Each path must be 1 to ${limits.maxItemLength} characters.` };
    }
    normalized.push(path);
  }
  return checkCount(normalizeList(normalized), "paths", limits.maxCount);
}

// Validates only the check_plan summary. The check log uses it for input that is not valid:
// it stores the summary only if the summary is valid (PRD 10.2).
export function validateSummary(input: unknown): Result<string> {
  if (!isFields(input)) {
    return { ok: false, reason: "The input must be an object." };
  }
  return readText(input, "summary", 500);
}

// Validates check_plan input (PRD 9.1).
// Sequence: summary, terms, paths, issueKey, then "one or more terms or paths".
export function validatePlan(input: unknown): Result<Plan> {
  if (!isFields(input)) {
    return { ok: false, reason: "The input must be an object." };
  }
  const summary = validateSummary(input);
  if (!summary.ok) {
    return summary;
  }
  const terms = readTerms(input, { maxRawLength: 1500, maxItemLength: 40, maxCount: 30 });
  if (!terms.ok) {
    return terms;
  }
  const paths = readPaths(input, { maxRawLength: 10500, maxItemLength: 200, maxCount: 50 });
  if (!paths.ok) {
    return paths;
  }
  const issueKey = readOptionalString(input, "issueKey");
  if (!issueKey.ok) {
    return issueKey;
  }
  if (issueKey.value !== undefined && !ISSUE_KEY_PATTERN.test(issueKey.value)) {
    return { ok: false, reason: "issueKey must be a Jira issue key, for example PROJ-42." };
  }
  if (terms.value.length === 0 && paths.value.length === 0) {
    return { ok: false, reason: "The plan must have one or more terms or paths." };
  }
  const plan: Plan = { summary: summary.value, terms: terms.value, paths: paths.value };
  if (issueKey.value !== undefined) {
    plan.issueKey = issueKey.value;
  }
  return { ok: true, value: plan };
}

export type DecisionField = "title" | "statement" | "terms" | "paths" | "sourceUrl";

const DECISION_FIELDS: readonly DecisionField[] = ["title", "statement", "terms", "paths", "sourceUrl"];

// Errors for each field that is not valid. The admin page shows each error next to its field
// (PRD 10.4). The rule "one or more terms or paths" is shown at terms.
export type DecisionFieldsResult =
  | { ok: true; value: DecisionInput }
  | { ok: false; errors: Partial<Record<DecisionField, string>> };

// Validates admin input for a decision record (PRD 10.1). Checks all fields.
// Terms and paths are comma-separated strings, the same as in check_plan.
export function validateDecisionFields(input: unknown): DecisionFieldsResult {
  if (!isFields(input)) {
    return { ok: false, errors: { title: "The input must be an object." } };
  }
  const title = readText(input, "title", 80);
  const statement = readText(input, "statement", 500);
  const terms = readTerms(input, { maxItemLength: 40, maxCount: 20 });
  const paths = readPaths(input, { maxItemLength: 200, maxCount: 10 });
  let sourceUrl = readOptionalString(input, "sourceUrl");
  if (sourceUrl.ok && sourceUrl.value !== undefined && !sourceUrl.value.startsWith("https://")) {
    sourceUrl = { ok: false, reason: "sourceUrl must start with https://." };
  }
  if (!title.ok || !statement.ok || !terms.ok || !paths.ok || !sourceUrl.ok) {
    const errors: Partial<Record<DecisionField, string>> = {};
    const results = { title, statement, terms, paths, sourceUrl };
    for (const field of DECISION_FIELDS) {
      const result = results[field];
      if (!result.ok) {
        errors[field] = result.reason;
      }
    }
    return { ok: false, errors };
  }
  if (terms.value.length === 0 && paths.value.length === 0) {
    return {
      ok: false,
      errors: { terms: "A decision record must have one or more terms or paths." },
    };
  }
  const decision: DecisionInput = {
    title: title.value,
    statement: statement.value,
    terms: terms.value,
    paths: paths.value,
  };
  if (sourceUrl.value !== undefined) {
    decision.sourceUrl = sourceUrl.value;
  }
  return { ok: true, value: decision };
}

// Validates admin input for a decision record and returns only the first error.
// Sequence: title, statement, terms, paths, sourceUrl, then "one or more terms or paths".
export function validateDecisionInput(input: unknown): Result<DecisionInput> {
  const result = validateDecisionFields(input);
  if (result.ok) {
    return result;
  }
  const first = DECISION_FIELDS.find((field) => result.errors[field] !== undefined);
  return { ok: false, reason: first === undefined ? "The input is not valid." : (result.errors[first] ?? "") };
}
