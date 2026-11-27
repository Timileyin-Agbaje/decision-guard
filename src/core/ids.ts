// Decision record IDs: "DG-" followed by a number (PRD 10.1).

// The number in "DG-<number>", or undefined if the ID does not have that form.
export function decisionIdNumber(id: string): number | undefined {
  const found = /^DG-(\d+)$/.exec(id);
  return found ? Number(found[1]) : undefined;
}

// By ID number, ascending: DG-2 before DG-10 (PRD 8.5). An ID without the "DG-<number>" form
// sorts last. Same number: by ID text. Plain comparison, not localeCompare (HR-4).
export function compareDecisionIds(a: string, b: string): number {
  const numberA = decisionIdNumber(a) ?? Number.POSITIVE_INFINITY;
  const numberB = decisionIdNumber(b) ?? Number.POSITIVE_INFINITY;
  if (numberA !== numberB) {
    return numberA < numberB ? -1 : 1;
  }
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
