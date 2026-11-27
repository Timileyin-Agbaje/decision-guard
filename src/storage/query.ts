// Shared key-value storage helpers (PRD 10.3).

import { kvs, WhereConditions } from "@forge/kvs";

// The documented maximum is 100 per page. One error code says "below 100", so use less.
const PAGE_SIZE = 50;

export type StoredItem = { key: string; value: unknown };

// Reads all items whose key starts with the prefix, page by page. Results are in key order.
// kvs.query is eventually consistent: a value written a moment ago can be missing.
export async function listByPrefix(prefix: string): Promise<StoredItem[]> {
  const items: StoredItem[] = [];
  let cursor: string | undefined;
  do {
    let query = kvs.query().where("key", WhereConditions.beginsWith(prefix)).limit(PAGE_SIZE);
    if (cursor !== undefined) {
      query = query.cursor(cursor);
    }
    const page = await query.getMany<unknown>();
    for (const result of page.results) {
      items.push({ key: result.key, value: result.value });
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return items;
}

// Writes the value only if the key does not exist (keyPolicy FAIL_IF_EXISTS).
// Returns true if this call wrote the value, false if the key was already used.
// The docs do not say if FAIL_IF_EXISTS gives an error or ignores the write when the key
// exists. Thus, after an error, read the key. After no error, check with isOurs that the
// stored value is this one.
export async function setIfAbsent(
  key: string,
  value: unknown,
  isOurs: (stored: unknown) => boolean,
): Promise<boolean> {
  try {
    await kvs.set(key, value, { keyPolicy: "FAIL_IF_EXISTS" });
  } catch (error: unknown) {
    if ((await kvs.get<unknown>(key)) === undefined) {
      throw error;
    }
    return false;
  }
  return isOurs(await kvs.get<unknown>(key));
}

const RANDOM_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789";

// Random characters from a to z and 0 to 9.
export function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => RANDOM_CHARACTERS[byte % RANDOM_CHARACTERS.length]).join("");
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
