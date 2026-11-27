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

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
