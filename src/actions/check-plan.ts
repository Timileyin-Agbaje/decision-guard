// Handler for the check_plan tool (action key "check-plan"). PRD 9.1, 9.4 and 11.

import { matchPlan } from "../core/match";
import { buildOutput, toOutputMatch, type OutputMatch } from "../core/output";
import type { Plan, Verdict } from "../core/types";
import { validatePlan, validateSummary } from "../core/validate";
import { writeCheckLog } from "../storage/check-log";
import { listActiveDecisions } from "../storage/decisions";

const INTERNAL_ERROR = "Internal error. The plan was not checked.";

type CheckResult = {
  verdict: Verdict;
  matches: OutputMatch[];
  errorReason?: string;
  // The valid plan, or undefined if the input is not valid.
  plan?: Plan;
};

// The account ID of the user for whom the agent works: context.principal.accountId.
function readAccountId(context: unknown): string {
  if (typeof context === "object" && context !== null && "principal" in context) {
    const principal: unknown = context.principal;
    if (typeof principal === "object" && principal !== null && "accountId" in principal) {
      const accountId: unknown = principal.accountId;
      if (typeof accountId === "string" && accountId !== "") {
        return accountId;
      }
    }
  }
  return "unknown";
}

// Steps 1 to 5 of PRD 9.1. Any failure gives ERROR, never CLEAR (HR-1).
async function runCheck(payload: unknown): Promise<CheckResult> {
  const validated = validatePlan(payload);
  if (!validated.ok) {
    return { verdict: "ERROR", matches: [], errorReason: validated.reason };
  }
  const plan = validated.value;
  try {
    const records = await listActiveDecisions();
    const result = matchPlan(plan, records);
    const byId = new Map(records.map((record) => [record.id, record]));
    const matches = result.matches.map((match) => {
      const record = byId.get(match.decisionId);
      if (record === undefined) {
        throw new Error(`Matched decision record ${match.decisionId} is missing.`);
      }
      return toOutputMatch(match, record);
    });
    return { verdict: result.verdict, matches, plan };
  } catch (error: unknown) {
    console.error("check_plan failed.", error);
    return { verdict: "ERROR", matches: [], errorReason: INTERNAL_ERROR, plan };
  }
}

// Each check writes one log entry, for all verdicts (PRD 9.1 step 6, 10.2).
// If the write fails, the verdict is still returned, with log FAILED (HR-7).
async function logCheck(
  payload: unknown,
  result: CheckResult,
  invokedBy: string,
): Promise<string | null> {
  try {
    // Input that is not valid: store the summary only if the summary itself is valid.
    const validSummary = validateSummary(payload);
    const summary = result.plan?.summary ?? (validSummary.ok ? validSummary.value : "");
    const entry = await writeCheckLog({
      invokedBy,
      summary,
      plan: { terms: result.plan?.terms ?? [], paths: result.plan?.paths ?? [] },
      verdict: result.verdict,
      matches: result.matches.map((match) => ({
        decisionId: match.decisionId,
        decisionVersion: match.decisionVersion,
      })),
      ...(result.plan?.issueKey !== undefined ? { issueKey: result.plan.issueKey } : {}),
    });
    return entry.id;
  } catch (error: unknown) {
    console.error("The check log write failed.", error);
    return null;
  }
}

export async function handler(payload: unknown, context: unknown): Promise<string> {
  const result = await runCheck(payload);
  const checkId = await logCheck(payload, result, readAccountId(context));
  return buildOutput({
    tool: "check_plan",
    verdict: result.verdict,
    checkId,
    matches: result.matches,
    ...(result.errorReason !== undefined ? { errorReason: result.errorReason } : {}),
    log: checkId === null ? "FAILED" : "OK",
  });
}
