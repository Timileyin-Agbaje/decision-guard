# Decision Guard: M1 Test Cases

| Item | Value |
|---|---|
| Purpose | Criterion M1 (`docs/prd.md` section 14.1): 20 correct verdicts out of 20 |
| Writing standard | ASD-STE100 Simplified Technical English |
| Related PRD version | 0.4 |

## 1 How to run the cases

1. Make sure that there are no active decision records.
2. Run case M1-15 first. It needs no active decision records.
3. On the admin page, make the decision records in section 2. Use the exact values.
4. Retire DG-5.
5. Run cases M1-01 to M1-14 and M1-16 to M1-20 through the installed `check_plan` tool.
6. For each case, compare the `verdict`, the `matches` and the `error` with the expected result.
7. Record each result in section 4.

**NOTE:** The admin page sets the decision record IDs. If the IDs on your site are different, use your IDs. The sort order of case M1-14 needs an ID with two digits. Make extra records, and retire them, until the next ID is `DG-10`. Or change the expected order in M1-14 to match your IDs.

**NOTE:** Each case uses the summary `Test plan`, unless the case gives a different summary.

## 2 Decision records

| ID | Title | Terms | Paths | Status |
|---|---|---|---|---|
| DG-1 | No new Redis dependency | `redis`, `ioredis`, `elasticache` | (none) | active |
| DG-2 | Billing code belongs to the payments team | (none) | `services/billing` | active |
| DG-3 | No GraphQL | `graphql`, `apollo server` | (none) | active |
| DG-4 | Legacy auth module is frozen | `passport` | `src/legacy/auth` | active |
| DG-5 | Do not use MongoDB | `mongodb`, `mongoose` | (none) | retired |
| DG-10 | Do not use AWS SDK v2 | `aws-sdk` | (none) | active |

## 3 Cases

### 3.1 Term rules

| ID | Terms input | Paths input | Expected verdict | Expected matches | Tests |
|---|---|---|---|---|---|
| M1-01 | `redis` | (empty) | `CONFLICT` | DG-1: term `redis` | Basic term match |
| M1-02 | `postgres` | (empty) | `CLEAR` | None | No match |
| M1-03 | `Redis` | (empty) | `CONFLICT` | DG-1: term `redis` | Lowercase |
| M1-04 | `  Apollo   Server  ` | (empty) | `CONFLICT` | DG-3: term `apollo server` | Spaces at the ends; two or more spaces |
| M1-05 | `redistribute` | (empty) | `CLEAR` | None | No partial match |
| M1-06 | `redis, Redis, REDIS` | (empty) | `CONFLICT` | DG-1: one `matchedOn` item, term `redis` | G4: duplicates removed |
| M1-12 | `mongoose` | (empty) | `CLEAR` | None | Retired records do not match |

### 3.2 Path rules

| ID | Terms input | Paths input | Expected verdict | Expected matches | Tests |
|---|---|---|---|---|---|
| M1-07 | (empty) | `services/billing/invoice.ts` | `CONFLICT` | DG-2: path `services/billing` | Path below a forbidden path |
| M1-08 | (empty) | `services/billing-v2/app.ts` | `CLEAR` | None | G1: folder boundary |
| M1-09 | (empty) | `./services/billing/` | `CONFLICT` | DG-2: path `services/billing` | `./` at the start; `/` at the end |
| M1-10 | (empty) | `services\billing\api.ts` | `CONFLICT` | DG-2: path `services/billing` | `\` changed to `/` |
| M1-11 | (empty) | `services` | `CLEAR` | None | A parent folder does not match |

### 3.3 Match structure

| ID | Terms input | Paths input | Expected verdict | Expected matches | Tests |
|---|---|---|---|---|---|
| M1-13 | `passport` | `src/legacy/auth/login.ts` | `CONFLICT` | DG-4: `matchedOn` = term `passport`, then path `src/legacy/auth` | G5: one match, list sorted terms first |
| M1-14 | `aws-sdk` | `services/billing/tax.ts` | `CONFLICT` | DG-2, then DG-10 | Sort by ID number: `DG-2` before `DG-10` |

### 3.4 Verdicts without a match

| ID | Terms input | Paths input | Expected verdict | Expected matches | Tests |
|---|---|---|---|---|---|
| M1-15 | `redis` | (empty) | `NO_RECORDS` | None | HR-2: no empty pass. Run with no active records. |

### 3.5 Errors

| ID | Input | Expected verdict | Expected error reason | Tests |
|---|---|---|---|---|
| M1-16 | Paths: `/home/user/repo/services/billing/app.ts` | `ERROR` | Paths must be relative to the repository root. | G2 |
| M1-17 | Paths: `services/../billing/x.ts` | `ERROR` | Paths must not contain '..'. | G3 |
| M1-18 | Terms: (empty). Paths: (empty) | `ERROR` | A reason that says that one or more terms or paths are necessary | Plan with no terms and no paths |
| M1-19 | Summary: (empty). Terms: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (41 characters) | `ERROR` | A reason about the summary, not about the term | Error order: summary first |
| M1-20 | Terms: `redis`. Issue key: `proj-42` | `ERROR` | A reason about the issue key format | Issue key pattern |

## 4 Results

| ID | Date | Verdict correct | Matches correct | Notes |
|---|---|---|---|---|
| M1-01 | | | | |
| M1-02 | | | | |
| M1-03 | | | | |
| M1-04 | | | | |
| M1-05 | | | | |
| M1-06 | | | | |
| M1-07 | | | | |
| M1-08 | | | | |
| M1-09 | | | | |
| M1-10 | | | | |
| M1-11 | | | | |
| M1-12 | | | | |
| M1-13 | | | | |
| M1-14 | | | | |
| M1-15 | | | | |
| M1-16 | | | | |
| M1-17 | | | | |
| M1-18 | | | | |
| M1-19 | | | | |
| M1-20 | | | | |

M1 passes when all 20 rows are correct.
