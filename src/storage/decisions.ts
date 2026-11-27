// Storage for decision records (PRD 10.1 and 10.3). Key: "decision:<id>", for example decision:DG-3.
// Decision records are never deleted. Retire them.
//
// Version claims: before an edit or retire writes version N, it claims the key
// "decision:v:<id>:<N>" with FAIL_IF_EXISTS. Only one write can claim a version. Thus two
// admins cannot both write version N, and an edit cannot undo a retire.

import { kvs } from "@forge/kvs";
import { compareDecisionIds, decisionIdNumber } from "../core/ids";
import type { Result } from "../core/result";
import type { DecisionInput, DecisionRecord } from "../core/types";
import { isObject, isStringList, listByPrefix, randomString, setIfAbsent } from "./query";

const PREFIX = "decision:";
// All record keys start with this. Claim keys ("decision:v:") do not, so a list does not read them.
const RECORD_PREFIX = `${PREFIX}DG-`;
const CLAIM_PREFIX = `${PREFIX}v:`;
const MAX_CREATE_ATTEMPTS = 5;

function keyFor(id: string): string {
  return `${PREFIX}${id}`;
}

function changedReason(id: string): string {
  return `Decision record ${id} was changed by another admin. Load it again, then try again.`;
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
  const items = await listByPrefix(RECORD_PREFIX);
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
    const written = await setIfAbsent(
      keyFor(record.id),
      record,
      (stored) =>
        isObject(stored) && stored.updatedAt === record.updatedAt && stored.updatedBy === accountId,
    );
    if (written) {
      return record;
    }
    next += 1;
  }
  throw new Error("Could not find a free decision record ID.");
}

// Writes the next version of a record, but only if no other write claimed that version.
// Returns false if another write claimed it first.
async function writeNextVersion(record: DecisionRecord): Promise<boolean> {
  const claimKey = `${CLAIM_PREFIX}${record.id}:${record.version}`;
  const token = randomString(12);
  const claimed = await setIfAbsent(
    claimKey,
    { token, claimedAt: record.updatedAt },
    (stored) => isObject(stored) && stored.token === token,
  );
  if (!claimed) {
    return false;
  }
  try {
    await kvs.set(keyFor(record.id), record);
  } catch (error: unknown) {
    // The record did not change. Remove the claim so that a later edit can use this version.
    // If the removal also fails, edits of this record give the "changed" error until
    // the claim key is removed.
    await kvs.delete(claimKey).catch((deleteError: unknown) => {
      console.warn(`Could not remove the claim ${claimKey}.`, deleteError);
    });
    throw error;
  }
  return true;
}

// Replaces the admin fields of an active record. Adds 1 to the version.
// If another admin changed the record at the same time, returns an error and writes nothing.
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
  if (!(await writeNextVersion(record))) {
    return { ok: false, reason: changedReason(id) };
  }
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
  if (!(await writeNextVersion(record))) {
    return { ok: false, reason: changedReason(id) };
  }
  return { ok: true, value: record };
}
