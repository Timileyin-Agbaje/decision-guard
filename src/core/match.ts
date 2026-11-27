// Match rules and verdicts from PRD sections 8.3 to 8.5.

import { compareDecisionIds } from "./ids";
import type { DecisionRecord, Match, MatchItem, MatchResult, Plan } from "./types";

// Plain comparison of UTF-16 code units. Do not use localeCompare: its result depends on
// the server language (HR-4).
function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

// Plan path matches a record path when it is equal, or starts with the record path then "/".
function pathMatches(planPath: string, recordPath: string): boolean {
  return planPath === recordPath || planPath.startsWith(`${recordPath}/`);
}

// Terms before paths, then by value.
function compareMatchItems(a: MatchItem, b: MatchItem): number {
  if (a.type !== b.type) {
    return a.type === "term" ? -1 : 1;
  }
  return compareText(a.value, b.value);
}

// Compares a validated (normalized) plan with the decision records.
// Retired records never match. One record gives one match, with all matched items.
// Each matched item has the value from the decision record.
export function matchPlan(plan: Plan, records: readonly DecisionRecord[]): MatchResult {
  const active = records.filter((record) => record.status === "active");
  if (active.length === 0) {
    return { verdict: "NO_RECORDS", matches: [] };
  }
  const planTerms = new Set(plan.terms);
  const matches: Match[] = [];
  for (const record of active) {
    const matchedOn: MatchItem[] = [];
    for (const term of record.terms) {
      if (planTerms.has(term)) {
        matchedOn.push({ type: "term", value: term });
      }
    }
    for (const path of record.paths) {
      if (plan.paths.some((planPath) => pathMatches(planPath, path))) {
        matchedOn.push({ type: "path", value: path });
      }
    }
    if (matchedOn.length > 0) {
      matches.push({
        decisionId: record.id,
        decisionVersion: record.version,
        matchedOn: matchedOn.sort(compareMatchItems),
      });
    }
  }
  matches.sort((a, b) => compareDecisionIds(a.decisionId, b.decisionId));
  return { verdict: matches.length > 0 ? "CONFLICT" : "CLEAR", matches };
}
