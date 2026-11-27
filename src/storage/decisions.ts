// Storage for decision records (PRD 10.1 and 10.3). Key: "decision:<id>", for example decision:DG-3.
// Decision records are never deleted. Retire them.

import { kvs } from "@forge/kvs";
import { compareDecisionIds, decisionIdNumber } from "../core/ids";
import type { Result } from "../core/result";
import type { DecisionInput, DecisionRecord } from "../core/types";
import { isObject, isStringList, listByPrefix } from "./query";

const PREFIX = "decision:";
const MAX_CREATE_ATTEMPTS = 5;

function keyFor(id: string): string {
  return `${PREFIX}${id}`;
}

// Checks the shape of a stored value. A bad value causes an error, so that a check fails
// closed (HR-1) and never gives CLEAR from damaged data.
function parseDecision(value: unknown, key: string): DecisionRecord {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    keyFor(value.id) !== key ||
    typeof value.title !== "string" ||
    typeof value.statement !== "string" ||
    !isStringList(value.terms) ||
    !isStringList(value.paths) ||
    (value.status !== "active" && value.status !== "retired") ||
    (value.sourceUrl !== undefined && typeof value.sourceUrl !== "string") ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    typeof value.updatedBy !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error(`The stored decision record "${key}" is not valid.`);
  }
  const record: DecisionRecord = {
    id: value.id,
    title: value.title,
    statement: value.statement,
    terms: value.terms,
    paths: value.paths,
    status: value.status,
    version: value.version,
    updatedBy: value.updatedBy,
    updatedAt: value.updatedAt,
  };
  if (value.sourceUrl !== undefined) {
    record.sourceUrl = value.sourceUrl;
  }
  return record;
}

function buildRecord(
  id: string,
  input: DecisionInput,
  status: DecisionRecord["status"],
  version: number,
  accountId: string,
): DecisionRecord {
  const record: DecisionRecord = {
    id,
    title: input.title,
    statement: input.statement,
    terms: input.terms,
    paths: input.paths,
    status,
    version,
    updatedBy: accountId,
    updatedAt: new Date().toISOString(),
  };
  if (input.sourceUrl !== undefined) {
    record.sourceUrl = input.sourceUrl;
  }
  return record;
}

// All decision records, active and retired, sorted by ID number.
export async function listDecisions(): Promise<DecisionRecord[]> {
  const items = await listByPrefix(PREFIX);
  return items
    .map((item) => parseDecision(item.value, item.key))
    .sort((a, b) => compareDecisionIds(a.id, b.id));
}

export async function listActiveDecisions(): Promise<DecisionRecord[]> {
  const records = await listDecisions();
  return records.filter((record) => record.status === "active");
}

// Strictly consistent read of one record.
export async function getDecision(id: string): Promise<DecisionRecord | undefined> {
  const value = await kvs.get<unknown>(keyFor(id));
  return value === undefined ? undefined : parseDecision(value, keyFor(id));
}

// Creates an active record with version 1. The ID is the highest existing number + 1.
// Records are never deleted, so the highest number never decreases and an ID is never reused.
// The list query is eventually consistent, so the write uses FAIL_IF_EXISTS. If the ID is
// taken, the next number is tried.
export async function createDecision(
  input: DecisionInput,
  accountId: string,
): Promise<DecisionRecord> {
  const existing = await listDecisions();
  let next =
    existing.reduce((highest, record) => Math.max(highest, decisionIdNumber(record.id) ?? 0), 0) + 1;
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const record = buildRecord(`DG-${next}`, input, "active", 1, accountId);
    const key = keyFor(record.id);
    try {
      await kvs.set(key, record, { keyPolicy: "FAIL_IF_EXISTS" });
    } catch (error: unknown) {
      // The docs do not give the error for an existing key. Read the key to find out.
      if ((await kvs.get<unknown>(key)) === undefined) {
        throw error;
      }
      next += 1;
      continue;
    }
    // The docs do not say if FAIL_IF_EXISTS fails or ignores the write. Make sure that the
    // stored record is this one.
    const stored = await getDecision(record.id);
    if (stored !== undefined && stored.updatedAt === record.updatedAt && stored.updatedBy === accountId) {
      return record;
    }
    next += 1;
  }
  throw new Error("Could not find a free decision record ID.");
}

// Replaces the admin fields of an active record. Adds 1 to the version.
// Two admins who edit at the same time: the last write wins.
export async function updateDecision(
  id: string,
  input: DecisionInput,
  accountId: string,
): Promise<Result<DecisionRecord>> {
  const current = await getDecision(id);
  if (current === undefined) {
    return { ok: false, reason: `Decision record ${id} does not exist.` };
  }
  if (current.status === "retired") {
    return { ok: false, reason: `Decision record ${id} is retired. It cannot be changed.` };
  }
  const record = buildRecord(id, input, "active", current.version + 1, accountId);
  await kvs.set(keyFor(id), record);
  return { ok: true, value: record };
}

// Sets the status to retired. Adds 1 to the version. A retired record cannot become active again.
export async function retireDecision(id: string, accountId: string): Promise<Result<DecisionRecord>> {
  const current = await getDecision(id);
  if (current === undefined) {
    return { ok: false, reason: `Decision record ${id} does not exist.` };
  }
  if (current.status === "retired") {
    return { ok: false, reason: `Decision record ${id} is already retired.` };
  }
  const record = buildRecord(id, current, "retired", current.version + 1, accountId);
  await kvs.set(keyFor(id), record);
  return { ok: true, value: record };
}
