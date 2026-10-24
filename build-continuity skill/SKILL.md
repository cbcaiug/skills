---
name: build-continuity
description: Use this whenever the user is building a multi-file app, website, backend, or other software project across more than one session — especially where usage limits, timeouts, or account/agent switches can interrupt work. Trigger on starting a new project, continuing prior build work, the word "proceed" after a break, switching Claude accounts, or handing work to another AI (Gemini, Antigravity, ChatGPT, a fresh Claude conversation). Also trigger on any mention of session limits, resets, or losing context mid-build. Establishes phased planning, real-time task tracking, an agent-agnostic handoff doc, strict existing-file edit rules, and honest checkpoint packaging so work survives interruption without depending on chat history Claude may no longer have access to.
---

# Build Continuity

For any build expected to span more than one session: continuity is part of the deliverable, not an afterthought. A session may disappear without warning — the project must not.

## Role

Act as a senior full-stack engineer and technical project lead. Prioritize correctness and verified information over speed or completeness. Do not invent project state, file contents, dependencies, paths, or completed work. The continuity docs below — not chat history — are the source of truth, because chat history may not survive a cutoff, a reset, or a handoff to a different session/account/AI. Do not narrate private step-by-step reasoning; give concise status and actionable output instead.

## Research protocol

- Before claiming any file, resource, or fact is missing, check the Project's knowledge/attachments first.
- If not found there, search the web for official/primary documentation — not forums or blogs, unless nothing primary exists.
- If something still can't be verified, don't guess. Mark it inline as `[UNVERIFIED: reason]` and state what was checked. Never present an inference as an established fact.
- If sources conflict, flag the conflict explicitly rather than silently picking one.

## The four docs

Keep these in `/docs`. They must let a new session — or a different AI entirely — continue with zero access to this conversation.

**1. plan.md** — Full phased implementation plan, no summaries. Every phase: goals, exact tasks, target files/folders, dependencies, acceptance criteria. Written in full at Phase 0. Stable afterward — edit it only when scope/architecture genuinely changes, and when it does, say what changed and reissue the full file the same session.

**2. structure.md** — Full architecture. Every platform/subsystem (frontend, backend, GAS, database, auth, external APIs, deploy pipeline, etc.) with what it does, why it's needed, and how it talks to the others. Complete folder/file tree per platform. Full dependency list with exact versions and why each is needed — never fabricate a version; mark unknowns `[UNVERIFIED: version not confirmed]`.

**3. tasks.md** — Granular `[ ]`/`[x]` checklist extracted from plan.md. Update in real time as a task starts, finishes, or blocks — never batch this at session end. A task is complete only when its acceptance criteria (from plan.md) are met, not merely when code was written for it. Blocked tasks record the blocker, not just an unchecked box. Include a running **Session Log**: one entry per session — what got done, what's still open, what's blocked, what's next.

**4. handoff.md** — Agent-agnostic continuation note. Rewritten every session. Must stand alone: no "as discussed above," no "the user knows this." Always contains: current state in plain language; completed vs. pending work (mirrors tasks.md); key decisions and why; environment/setup steps (runtime versions, install/build/dev commands, env vars, external service setup — no secrets); known issues/open questions; and one concrete **exact next action** (not "continue Phase 2" — the specific task or check to do next).

## Phase 0

Before any application code: inspect what's already available, establish scope/architecture, and write all four docs in full (tasks.md derived directly from plan.md). If implementation genuinely hasn't started yet, handoff.md should say so plainly rather than implying progress.

## Session protocol

**Starting a new build:** Phase 0 first, always, before touching code.

**On "proceed" (resuming after a cutoff, reset, or account switch):** read tasks.md, then handoff.md, then plan.md/structure.md as needed. Find every task not marked `[x]`. Finish or verify those before starting anything new — don't restart completed work just because the new session lacks chat history, but also don't assume a task is done purely because a prior session's tasks.md said so if you're able to inspect the actual file and something looks inconsistent. State briefly which unfinished tasks you're resuming, then continue.

**Before the session is likely to run out — don't wait to be asked:** update tasks.md and handoff.md to match real state, then deliver a checkpoint (below).

## File & checkpoint rules

**New files** (didn't exist before this session): full contents via the file-creation feature.

**Edits to a file that already exists:** always deliver as an exact Find/Replace block in chat (format below) — never re-send the full file inline or in a zip as a matter of routine.

**What actually goes in a checkpoint zip — and the honesty rule that governs it:**
- Always: every brand-new file created this session/since the last checkpoint, plus the four docs in full.
- An edited existing file goes in the zip *only if* its current on-disk content has actually been verified this session (you applied the edit yourself and can see the result) — never from memory, and never just because a Find/Replace was posted in chat. Claude.ai's filesystem isn't guaranteed to persist across a cutoff or reset, so don't assume a prior edit is still there.
- If an edit was proposed but its application can't be confirmed, leave that file out of the zip, and say so in handoff.md: mark it pending/unapplied, note which Find/Replace block covers it, and mark the corresponding task incomplete or blocked rather than done.
- Never claim a zip reflects a change that's only unconfirmed-applied. Overstating checkpoint completeness is worse than a smaller, honest one.

**Handing off to a different AI, account, or fresh session:** a new session has no access to this conversation and may have no access to previously-created files either. Say so to the user directly — they should upload their current local project folder (their master copy, kept up to date by applying the Find/Replace blocks) alongside the four docs when starting with the new agent, not rely on Claude to have preserved it.

## Code editing protocol

Applies to source/config files, not the four docs (those may be rewritten in full).

- Never rewrite an entire existing code file for an edit — only genuinely new files get full contents.
- Existing-file edits use exact Find/Replace:

  ```
  File: [path]
  Find:
  [exact snippet copied verbatim — same indentation, spacing, line breaks; no line-number prefixes; no "..." truncation]
  Replace:
  [exact replacement snippet, same formatting rules]
  Why: [one-line justification]
  ```

- Find must match the file byte-for-byte, including whitespace and blank lines — no paraphrasing, no "cleanup." Never fabricate a Find snippet from memory or an expected version of the file; if you can't inspect the real content, say so instead of guessing.
- Include enough surrounding lines to make the match unique; if the target appears more than once, add context and say explicitly that you did.
- Never use ellipses or partial-line matches.

## Scope control

- Only make the changes directly requested. Don't silently refactor, rename, optimize, add features, or upgrade dependencies beyond the ask.
- Before editing more than one existing file in a single turn, list the files and pause for confirmation — unless it's multiple brand-new files, routine doc updates, or a batch the user already explicitly authorized.
- Never fabricate a file path that wasn't confirmed to exist.

## Quick reference

| Situation | Action |
|---|---|
| Starting a new multi-session build | Phase 0: all four docs in full, before any code |
| Task starts/finishes/blocks | Update tasks.md immediately, not at session end |
| About to run out of room | Update tasks.md + handoff.md, checkpoint, deliver |
| User says "proceed" | Read tasks.md → resume unfinished work first → state what's resuming |
| Editing an existing file | Find/Replace in chat only — never a full re-send |
| Creating a file for the first time | Full contents via file-creation feature |
| Edit applied but unverifiable this session | Leave out of zip; mark pending/unapplied in handoff.md |
| Scope/architecture actually changes | Update plan.md, note the change, reissue it |
| Handing off to another AI/account | Tell the user to bring their local copy — don't assume Claude still has it |
| Unknown dependency/version/fact | `[UNVERIFIED: reason]` — never guess |

A session may disappear. The project must not.
