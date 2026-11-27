// Storage for check log entries (PRD 10.2 and 10.3). Key: "check:<id>".
// Only the last 50 entries are kept.

import { kvs } from "@forge/kvs";
import type { CheckLogEntry, Verdict } from "../core/types";
import { isObject, isStringList, listByPrefix, randomString, setIfAbsent } from "./query";

const PREFIX = "check:";
const KEEP = 50;
const MAX_WRITE_ATTEMPTS = 5;
const VERDICTS: readonly Verdict[] = ["CONFLICT", "CLEAR", "NO_RECORDS", "ERROR"];

export type NewCheckLogEntry = Omit<CheckLogEntry, "id" | "createdAt">;

function isVerdict(value: unknown): value is Verdict {
  return VERDICTS.some((verdict) => verdict === value);
}

function isLogMatchList(value: unknown): value is CheckLogEntry["matches"] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        isObject(item) && typeof item.decisionId === "string" && typeof item.decisionVersion === "number",
    )
  );
}

function parseEntry(value: unknown, key: string): CheckLogEntry {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    `${PREFIX}${value.id}` !== key ||
    (value.issueKey !== undefined && typeof value.issueKey !== "string") ||
    typeof value.invokedBy !== "string" ||
    typeof value.summary !== "string" ||
    !isObject(value.plan) ||
    !isStringList(value.plan.terms) ||
    !isStringList(value.plan.paths) ||
    !isVerdict(value.verdict) ||
    !isLogMatchList(value.matches) ||
    typeof value.createdAt !== "string"
  ) {
    throw new Error(`The stored check log entry "${key}" is not valid.`);
  }
  const entry: CheckLogEntry = {
    id: value.id,
    invokedBy: value.invokedBy,
    summary: value.summary,
    plan: { terms: value.plan.terms, paths: value.plan.paths },
    verdict: value.verdict,
    matches: value.matches.map((match) => ({
      decisionId: match.decisionId,
      decisionVersion: match.decisionVersion,
    })),
    createdAt: value.createdAt,
  };
  if (value.issueKey !== undefined) {
    entry.issueKey = value.issueKey;
  }
  return entry;
}

// Newest first: by createdAt, then by ID, so that the order is fixed.
function compareNewestFirst(a: CheckLogEntry, b: CheckLogEntry): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt > b.createdAt ? -1 : 1;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id > b.id ? -1 : 1;
}

// "CHK-" + UTC date + "-" + 4 random characters, for example CHK-20261127-a1b2.
function makeCheckId(now: Date): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `CHK-${date}-${randomString(4)}`;
}

async function listAllEntries(): Promise<CheckLogEntry[]> {
  const items = await listByPrefix(PREFIX);
  return items.map((item) => parseEntry(item.value, item.key)).sort(compareNewestFirst);
}

// Deletes all entries except the newest 50. The list query is eventually consistent, so a
// new entry can be missing from the list. The next write then removes the extra entry.
async function pruneCheckLog(): Promise<void> {
  const entries = await listAllEntries();
  for (const entry of entries.slice(KEEP)) {
    await kvs.delete(`${PREFIX}${entry.id}`);
  }
}

// Writes one entry, then removes old entries. An error in the write goes to the caller,
// which sets log to FAILED (HR-7). An error in the removal does not: the entry is written.
// Two checks can get the same ID. The write never replaces an entry: it tries a new ID.
export async function writeCheckLog(newEntry: NewCheckLogEntry): Promise<CheckLogEntry> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const now = new Date();
    const entry: CheckLogEntry = { ...newEntry, id: makeCheckId(now), createdAt: now.toISOString() };
    if (entry.issueKey === undefined) {
      delete entry.issueKey;
    }
    const written = await setIfAbsent(
      `${PREFIX}${entry.id}`,
      entry,
      (stored) =>
        isObject(stored) &&
        stored.createdAt === entry.createdAt &&
        stored.invokedBy === entry.invokedBy &&
        stored.summary === entry.summary,
    );
    if (!written) {
      continue;
    }
    try {
      await pruneCheckLog();
    } catch (error: unknown) {
      console.warn("Could not remove old check log entries.", error);
    }
    return entry;
  }
  throw new Error("Could not find a free check log ID.");
}

// The last 50 entries, newest first.
export async function listCheckLog(): Promise<CheckLogEntry[]> {
  const entries = await listAllEntries();
  return entries.slice(0, KEEP);
}
