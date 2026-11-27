// Resolver for the admin page (PRD 10.4). Only Jira admins can use it (HR-5).
// The check is in the backend, for each function. Hiding the page is not enough.

import { asUser, route } from "@forge/api";
import Resolver from "@forge/resolver";
import type { DecisionRecord } from "../core/types";
import { validateDecisionFields } from "../core/validate";
import { createDecision, listDecisions, retireDecision, updateDecision } from "../storage/decisions";
import type { AdminResponse } from "./api-types";

const NOT_ADMIN = "Only Jira admins can manage decision records.";
const INTERNAL_ERROR = "Internal error. Try again.";
const ID_PATTERN = /^DG-\d+$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Jira checks the user who makes the request (asUser), so the result does not depend on data
// from the page. Any failure means "not an admin" (fail closed).
// Scope: read:permission:jira. Endpoint: GET /rest/api/3/mypermissions.
async function isJiraAdmin(): Promise<boolean> {
  try {
    const response = await asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.warn(`The admin check failed with status ${response.status}.`);
      return false;
    }
    const body: unknown = await response.json();
    return (
      isObject(body) &&
      isObject(body.permissions) &&
      isObject(body.permissions.ADMINISTER) &&
      body.permissions.ADMINISTER.havePermission === true
    );
  } catch (error: unknown) {
    console.warn("The admin check failed.", error);
    return false;
  }
}

function readAccountId(context: unknown): string | undefined {
  if (isObject(context) && typeof context.accountId === "string" && context.accountId !== "") {
    return context.accountId;
  }
  return undefined;
}

function readId(payload: unknown): string | undefined {
  if (isObject(payload) && typeof payload.id === "string" && ID_PATTERN.test(payload.id)) {
    return payload.id;
  }
  return undefined;
}

// Runs the action only for a Jira admin. Storage errors give a short reason; details go to the logs.
async function asAdmin<T>(
  name: string,
  context: unknown,
  action: (accountId: string) => Promise<AdminResponse<T>>,
): Promise<AdminResponse<T>> {
  const accountId = readAccountId(context);
  if (accountId === undefined || !(await isJiraAdmin())) {
    return { ok: false, reason: NOT_ADMIN };
  }
  try {
    return await action(accountId);
  } catch (error: unknown) {
    console.error(`Admin function ${name} failed.`, error);
    return { ok: false, reason: INTERNAL_ERROR };
  }
}

const resolver = new Resolver();

resolver.define("listDecisions", async ({ context }) =>
  asAdmin<DecisionRecord[]>("listDecisions", context, async () => ({
    ok: true,
    value: await listDecisions(),
  })),
);

resolver.define("createDecision", async ({ payload, context }) =>
  asAdmin<DecisionRecord>("createDecision", context, async (accountId) => {
    const validated = validateDecisionFields(payload);
    if (!validated.ok) {
      return { ok: false, reason: "Correct the fields that are not valid.", fieldErrors: validated.errors };
    }
    return { ok: true, value: await createDecision(validated.value, accountId) };
  }),
);

resolver.define("updateDecision", async ({ payload, context }) =>
  asAdmin<DecisionRecord>("updateDecision", context, async (accountId) => {
    const id = readId(payload);
    if (id === undefined) {
      return { ok: false, reason: "The decision record ID is not valid." };
    }
    const validated = validateDecisionFields(payload);
    if (!validated.ok) {
      return { ok: false, reason: "Correct the fields that are not valid.", fieldErrors: validated.errors };
    }
    return updateDecision(id, validated.value, accountId);
  }),
);

resolver.define("retireDecision", async ({ payload, context }) =>
  asAdmin<DecisionRecord>("retireDecision", context, async (accountId) => {
    const id = readId(payload);
    if (id === undefined) {
      return { ok: false, reason: "The decision record ID is not valid." };
    }
    return retireDecision(id, accountId);
  }),
);

export const handler = resolver.getDefinitions();
