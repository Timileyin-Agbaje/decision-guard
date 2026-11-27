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

function sameRecord(a: DecisionRecord, b: DecisionRecord): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.statement === b.statement &&
    a.terms.join("\n") === b.terms.join("\n") &&
    a.paths.join("\n") === b.paths.join("\n") &&
    a.status === b.status &&
    a.sourceUrl === b.sourceUrl &&
    a.version === b.version &&
    a.updatedBy === b.updatedBy &&
    a.updatedAt === b.updatedAt
  );
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
    // A record with the same ID from another write differs in one or more fields.
    const written = await setIfAbsent(keyFor(record.id), record, (stored) =>
      sameRecord(parseDecision(stored, keyFor(record.id)), record),
    );
    if (written) {
      return record;
    }
    next += 1;
  }
  throw new Error("Could not find a free decision record ID.");
}

// A claim older than this is stale: its write can no longer be in progress. The longest Forge
// function timeout is 15 minutes; 20 minutes gives a margin.
const STALE_CLAIM_MS = 20 * 60 * 1000;

type Claim = { token: string; claimedAt: string };

function isStaleClaim(value: unknown): value is Claim {
  return (
    isObject(value) &&
    typeof value.token === "string" &&
    typeof value.claimedAt === "string" &&
    Date.now() - Date.parse(value.claimedAt) > STALE_CLAIM_MS
  );
}

// Claims the version of the record. Returns false if another write has the claim.
// A failure at any step can leave a claim with no write. Such a claim becomes stale, and
// a later write takes it over. Thus a failure blocks changes to a record for 20 minutes or less.
async function claimVersion(record: DecisionRecord, claimKey: string): Promise<boolean> {
  const claim: Claim = { token: randomString(12), claimedAt: new Date().toISOString() };
  const isOurs = (stored: unknown): boolean => isObject(stored) && stored.token === claim.token;
  if (await setIfAbsent(claimKey, claim, isOurs)) {
    return true;
  }
  const existing = await kvs.get<unknown>(claimKey);
  if (!isStaleClaim(existing)) {
    return false;
  }
  // The claim was used if the record has its version. Then this write is late.
  const latest = await getDecision(record.id);
  if (latest === undefined || latest.version !== record.version - 1) {
    return false;
  }
  // Only one write can take over a stale claim: the key of the takeover contains its token.
  if (!(await setIfAbsent(`${claimKey}:${existing.token}`, claim, isOurs))) {
    return false;
  }
  await kvs.set(claimKey, claim);
  return true;
}

// Writes the next version of a record, but only if no other write claimed that version.
// Returns false if another write claimed it first.
async function writeNextVersion(record: DecisionRecord): Promise<boolean> {
  const claimKey = `${CLAIM_PREFIX}${record.id}:${record.version}`;
  if (!(await claimVersion(record, claimKey))) {
    return false;
  }
  try {
    await kvs.set(keyFor(record.id), record);
  } catch (error: unknown) {
    // Remove the claim only if a strictly consistent read shows the old version. Then a new
    // edit can start at once. Otherwise the claim becomes stale and is taken over later.
    try {
      const latest = await getDecision(record.id);
      if (latest !== undefined && latest.version === record.version - 1) {
        await kvs.delete(claimKey);
      }
    } catch (cleanupError: unknown) {
      console.warn(`Could not remove the claim ${claimKey}.`, cleanupError);
    }
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
