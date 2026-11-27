# Decision Guard

Atlassian Forge app for Jira, written in TypeScript. It exposes MCP tools that check a coding agent's plan against the team's decision records. The specification is `docs/prd.md`. It is the source of truth.

## Workflow

- Do one build task (B1, B2, ...) from `docs/prd.md` section 17 at a time. Do not start the next task.
- Before you write code, read the PRD sections that the task lists. Then write a plan of 5 lines or less, and wait for approval.
- If the PRD is not clear, or the code shows that the PRD is wrong, stop and ask. Do not guess.
- Make a branch for each task. Use the branch name from the Linear issue if I give one. Otherwise use a name like `b1-core-rules`. Do not commit to `main`.
- Show the full diff before each commit.
- Commit message format: `B3: add check-plan action`.
- When the task is complete, push the branch and open a pull request with `gh pr create`. The description must start with `Fixes <Linear issue ID>`, for example `Fixes DG-12`. Then give the task ID, what changed, and how you verified it.

## Linear

- Linear tracks the tasks. The `linear` MCP server is connected.
- When I give you a Linear issue ID, read the issue first. Then read the PRD sections that it lists.
- When you start the task, move the issue to In Progress.
- When you open the pull request, add a comment on the issue with the pull request link.
- Do not move an issue to Done. The GitHub integration does this when I merge.
- Do not make, edit or close other issues unless I ask.

## Code review

- Greptile reviews each pull request automatically.
- When I ask you to address the review, read the Greptile comments with `gh pr view --comments`.
- For each comment: fix it, or reply with the reason that you did not fix it. Do not ignore a comment.
- If a comment conflicts with `docs/prd.md`, the PRD wins. Tell me about the conflict.
- Keep pull requests small: one task per pull request. Small pull requests get better reviews.
- Do not merge pull requests. I merge them.

## Commands

- Typecheck: `npx tsc --noEmit`
- Lint: `forge lint`
- Deploy: `forge deploy`
- Upgrade the installation: `forge install --demo-site --product jira -e development --upgrade`
- Logs: `forge logs`

## Verify your work

- After each change, run `npx tsc --noEmit` and `forge lint`. Fix all errors.
- After a change to a tool, run `forge deploy`. Then call the tool through the `decision-guard` MCP server and show the exact output.
- After a change to the admin page, deploy, then tell me what to check on the page.
- Test cases are in `docs/prd.md` section 14.3 and in `docs/m1-cases.md`.

## Tests

- Do not add a unit test framework (Jest, Vitest or other). Do not add test files.
- Tests are end-to-end only, through the installed app.

## Code layout

- `src/core/`: plain functions for normalization, validation and matching. No Forge imports in this folder. The tools and the admin page both use it.
- `src/actions/`: one file for each MCP tool handler.
- `src/admin/`: the admin page resolver.
- `src/frontend/`: UI Kit frontend code (`.tsx`).
- `src/storage/`: all `@forge/kvs` access. Other folders do not import `@forge/kvs`.

## TypeScript

- `strict` mode is on. Do not turn it off.
- Do not use `any`. Use `unknown`, then narrow the type.
- Give each exported function an explicit return type.
- For validation, return the `Result` type from `src/core/result.ts`: `{ ok: true, value }` or `{ ok: false, reason }`. Do not throw for bad input.
- Treat tool inputs as `unknown` until validation is complete. Do not trust the types that the manifest declares.

## Conventions

- Use named exports, not default exports.
- Build all tool output with one shared function. Output is one line of JSON (`JSON.stringify` with no indentation).
- Use `@forge/react` UI Kit components only. Do not add custom CSS.
- Use storage key prefixes `decision:` and `check:`.
- Do not add a dependency without approval.

## Hard constraints

- Do not send data outside Atlassian. Do not call an external API or an LLM. The app must keep the "Runs on Atlassian" badge.
- Do not remove the `app.rovo` block from `manifest.yml`. From 5 Jan 2027, Forge blocks deploys of `rovo:mcp` apps without it.
- Do not connect the app to Confluence. Enabling MCP tools with Confluence connected breaks the external endpoint.
- If `forge deploy` asks for `--approve MAJOR_VERSION_RULE`, stop and tell me. Do not approve it yourself.

## Gotchas

- Action inputs accept only `string`, `integer`, `number` and `boolean`. For lists, use comma-separated strings.
- Rovo removes line breaks from tool output. This is why output is single-line JSON.
- Forge adds the environment to the tool name, for example `check-plan_development`. Do not use exact tool names in `skill.md` or in agent prompts.
- MCP tool calls run as the user. `asApp()` is not available in action handlers.
- A scope change needs `forge deploy --approve MAJOR_VERSION_RULE` and then an install upgrade. Without both, new modules do not show.
- Node.js must be version 24 (`.node-version`, managed by `fnm`). The Forge CLI does not support Node.js 26.
- Admin page URL on the demo site: `https://one-atlas-qiuq.atlassian.net/jira/settings/apps/56208479-cbf9-4775-82f5-1c1af8f04120/8569fc95-4b44-4078-83f7-8cba4e91e7a0`
