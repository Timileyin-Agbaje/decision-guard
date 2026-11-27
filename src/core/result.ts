// Return type for validation. Bad input gives { ok: false, reason }; it never throws.
export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
