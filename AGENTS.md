# AGENTS.md

## Key Requirements

1. **Do not modify unrelated files** - Only change files directly related to the current task. Avoid incidental refactoring or "improvements" to adjacent code.

2. **Explain architecture decisions** - Before implementing significant changes, document the reasoning behind architectural choices, trade-offs considered, and alternatives evaluated.

3. **Generate production-ready code** - Write code that is complete, tested, handles errors appropriately, follows security best practices, and meets operational requirements (logging, monitoring, etc.).

4. **Wait for review before starting the next milestone** - Complete each milestone fully, verify it works, and obtain explicit approval before proceeding to the next phase of work.

5. **Update CHANGELOG.md after completing work** - This rule is non-optional. A task is **not complete** until `CHANGELOG.md` reflects it. If your work produced a notable change, the agent's final summary is incomplete without a CHANGELOG entry.

   **Procedure.** After any notable work (new feature, implementation plan, ADR, refactor, bug fix, dependency change, schema migration, config change, or significant doc addition), do all of the following in order:

   1. **Edit `CHANGELOG.md`:**
      - Add a bullet under the appropriate subsection (`### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`) — follow the Keep a Changelog format already declared at the top of the file.
      - Cite the file paths changed and, where applicable, the spec/ADR/vision line numbers.
      - If the work warrants a version bump (patch for fixes, minor for new features and plans, major for breaking changes — per SemVer), add a new dated version header (e.g., `## [0.6.0] - 2026-07-15`).
   2. **Update frontmatter:**
      - Bump `version` to match the new release header.
      - Update `last_updated` to the current ISO timestamp with timezone (e.g., `2026-07-15T14:30:00+10:00`).
   3. **Sync related files when applicable:**
      - `package.json#version` — CHANGELOG is the source of truth; sync `package.json` to it.
      - `docs/file-reference.md` — if files were added, removed, or significantly modified.
      - `docs/decisions/NNNN-*.md` — write a new ADR if an architectural decision was made.

   **Mandatory self-verification.** The agent's final summary of any task that constitutes "completed work" must include a line like `CHANGELOG.md updated: yes` (or `no — reason`). The user uses this to confirm compliance.

   **Scope of "notable work":** Includes implementation plans, ADRs, source files, configuration, dependencies, build tooling, and significant doc additions. Excludes purely conversational work, internal agent thinking, and trivial edits that do not change user-visible behavior (e.g., typo fixes in a comment).

   **Why this matters.** `CHANGELOG.md` is the project's memory of what changed and when. Skipping it breaks version tracking, makes release notes impossible, and hides regressions behind missing history. The cost of updating CHANGELOG.md is two minutes; the cost of discovering six months later that work was never recorded is hours of archaeology.

6. **Read project context at session start and before implementation** - This rule fires on two triggers: (a) the first response of any new session, and (b) immediately before writing or modifying implementation code. Both triggers must be satisfied; neither is optional.

   **(a) Session start procedure.** Before producing any work in a new session, read **every one** of these in order:

   1. `AGENTS.md` (this file) — confirm the rules have not changed since your training cutoff.
   2. `docs/project_vision.md` — the authoritative vision; everything else aligns to it.
   3. `docs/file-reference.md` — current file inventory by phase.
   4. **Every `.md` file under `docs/` and `docs/decisions/` recursively.** This includes plans, specs, ADRs, handoff docs, decision indexes, and any new doc added in the future. Do not skip files. Do not stop at the first match. Do not filter by "relevance" — read everything.
   5. The newest file in `docs/superpowers/plans/` (by filename date, e.g. `YYYY-MM-DD-*.md`) — read it last because it is the most recent and most specific to the current work.

   **Mandatory self-verification.** In your first response of every session, briefly list the docs you read at session start. If you could not read all of them, say so explicitly and explain why. The user uses this list to verify the protocol was followed.

   **(b) Before writing or modifying implementation code.** Re-read the specific plan, spec, or ADR that authorizes the change. In your work, cite the section number, ADR number, or vision line number that the change aligns with. If the change touches a function, class, or method, identify its blast radius (callers, affected modules, dependency surface) before proceeding.

   **Why the breadth is intentional.** Future sessions inherit incomplete context if any doc is skipped. Small handoff docs and ADRs often contain the *why* behind decisions that the plans only summarize; an agent that skips them may re-litigate settled questions or unknowingly violate a documented constraint. The cost of reading a few extra files is far less than the cost of producing work that conflicts with a rule the agent never saw.
