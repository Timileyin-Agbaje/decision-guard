// Normalization rules from PRD section 8.2. The steps are in the PRD sequence.

// Splits a comma-separated input string into raw items.
export function parseList(raw: string): string[] {
  return raw.split(",");
}

export function normalizeTerm(term: string): string {
  return term
    .normalize("NFC")
    .trim()
    // toLowerCase, not toLocaleLowerCase: the result must not depend on the server language.
    .toLowerCase()
    .replace(/ {2,}/g, " ");
}

export function normalizePath(path: string): string {
  let result = path
    .normalize("NFC")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
  while (result.startsWith("./")) {
    result = result.slice(2);
  }
  // Letter case does not change.
  return result.replace(/\/+$/, "");
}

// Removes empty items and duplicates from normalized items. Keeps the first-seen order.
export function normalizeList(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (item === "" || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return result;
}
