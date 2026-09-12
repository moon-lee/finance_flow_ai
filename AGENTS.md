# AGENTS.md

## Key Requirements

1. **Do not modify unrelated files** - Only change files directly related to the current task. Avoid incidental refactoring or "improvements" to adjacent code.

2. **Explain architecture decisions** - Before implementing significant changes, document the reasoning behind architectural choices, trade-offs considered, and alternatives evaluated.

3. **Generate production-ready code** - Write code that is complete, tested, handles errors appropriately, follows security best practices, and meets operational requirements (logging, monitoring, etc.).

4. **Wait for review before starting the next milestone** - Complete each milestone fully, verify it works, and obtain explicit approval before proceeding to the next phase of work.

5. **Update CHANGELOG.md after completing work** - This rule is non-optional. A task is **not complete** until `CHANGELOG.md` reflects it.

   **Procedure.** After any notable work (new feature, refactor, bug fix, dependency change, schema migration, config change, or significant doc addition), do all of the following in order:

   1. **Edit `CHANGELOG.md`:**
      - Add a bullet under the appropriate subsection (`### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`) — follow the Keep a Changelog format already declared at the top of the file.
      - Cite the file paths changed and, where applicable, the spec/ADR/vision line numbers.
   2. **Sync version with `package.json`:**
      - `package.json#version` is the single source of truth for version numbers.
      - Set `CHANGELOG.md` frontmatter `version` and the latest `## [X.Y.Z]` header to match `package.json#version`. If the header does not exist yet, add a new dated version header with that version.
      - Update `last_updated` to the current ISO timestamp with timezone (e.g., `2026-07-15T14:30:00+10:00`).
      - Never bump the version yourself; if a bump is needed use `npm run version:bump` or ask the user.
   3. **Sync related files when applicable:**
      - `docs/file-reference.md` — if files were added, removed, or significantly modified.

   **Mandatory self-verification.** The agent's final summary of any task that constitutes "completed work" must include a line like `CHANGELOG.md updated: yes` (or `no — reason`).

6. **Ask before git commit** - Never `git commit`, `git push`, or `git tag` without explicit user permission. Wait for the user to say "git commit" or "commit now" or equivalent. You may still edit `CHANGELOG.md` content and sync its version to `package.json#version` without asking.

7. **Read project context at session start and before implementation** - This rule fires on two triggers: (a) the first response of any new session, and (b) immediately before writing or modifying implementation code. Both triggers must be satisfied; neither is optional.

   **(a) Session start procedure.** Before producing any work in a new session, read **every one** of these in order:

   1. `AGENTS.md` (this file) — confirm the rules have not changed since your training cutoff.
   2. `docs/project_vision.md` — the authoritative vision; everything else aligns to it.
   3. `docs/file-reference.md` — current file inventory by phase.
   4. **Every `.md` file under `docs/` and `docs/decisions/` recursively, except `docs/archives/`.** This includes plans, specs, ADRs, handoff docs, decision indexes, and any new doc added in the future. Completed phase plans are moved to `docs/archives/` and are not required for session-start context. Do not skip files outside archives. Do not stop at the first match. Do not filter by "relevance" — read everything in the active tree.
   5. The newest file in `docs/superpowers/plans/` (by filename date, e.g. `YYYY-MM-DD-*.md`) — read it last because it is the most recent and most specific to the current work.

   **Mandatory self-verification.** In your first response of every session, briefly list the docs you read at session start. If you could not read all of them, say so explicitly and explain why. The user uses this list to verify the protocol was followed.

       > **Session-context exception (incremental reads):** If you have already completed this full read sequence earlier in the same session, and no new `.md` files have been added to `docs/` or `docs/decisions/` since then, you MAY rely on that earlier read instead of re-reading every file. This exception exists because the session-start protocol is a fixed context cost, and re-reading an unchanged corpus every turn offers no new information.

    **(b) Before writing or modifying implementation code.** Re-read the specific plan, spec, or ADR that authorizes the change. In your work, cite the section number, ADR number, or vision line number that the change aligns with. If the change touches a function, class, or method, identify its blast radius (callers, affected modules, dependency surface) before proceeding.

   **Why the breadth is intentional.** Future sessions inherit incomplete context if any doc is skipped. Small handoff docs and ADRs often contain the *why* behind decisions that the plans only summarize; an agent that skips them may re-litigate settled questions or unknowingly violate a documented constraint. The cost of reading a few extra files is far less than the cost of producing work that conflicts with a rule the agent never saw.
