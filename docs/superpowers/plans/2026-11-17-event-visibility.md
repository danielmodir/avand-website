# Event Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one event be shown independently on the Occasions and Planning desks while keeping one shared event record and the existing global desk switches.

**Architecture:** Add two default-true flags to the event data. Filter only at desk render boundaries; storage, recurrence, notifications, search, and deletion continue to use the original record. PHP document sync accepts the additive fields; Django Event and its API need a nullable-safe migration and client mapping.

**Tech Stack:** Vanilla JS, PHP JSON sync, Django 5.2/DRF, Node tests.

**Spec:** User's 2026-11-17 development request, sections 4.1 and 4.7; `docs/CHANGES.md` and `frontend/demo/README.md`.

## Global Constraints

- Keep existing HTML/CSS/vanilla JS architecture, fa/en copy, light/dark themes, and offline operation.
- Do not create another event record or change external notification behavior when a desk hides one.
- Never delete an event from Google Calendar when a desk hides it.
- Preserve old events as visible in both desks and keep existing global desk switches.
- Keep user changes already present in the working tree; commit only this work.

## Review Focus

- Old event without flags appears in both desks; cover in the pure visibility test.
- Hiding in one desk leaves the other visible and preserves notification; cover in the UI and data tests.
- Toggling a global desk switch does not rewrite per-event flags; cover in the UI test.
- A saved event round-trips through both adapters; cover in adapter and Django tests.
- Group events retain existing group permissions; do not expose a new edit path.

---

### Task 1: Data contract

**Files:** `backend/apps/planning/models.py`, `backend/apps/planning/serializers.py`, a new migration, `frontend/demo/js/services/api.js`, `backend/apps/planning/tests.py`, `tests/event-visibility.test.js`.

**Interfaces:** Event fields `showInPlanning` and `showInOccasions` are booleans defaulting to true; Django fields are `show_in_planning` and `show_in_occasions`.

- [ ] Add failing tests for old-event defaults, false/true mapping, and Django API round-trip.
- [ ] Run the targeted tests and observe failure.
- [ ] Add the fields and additive migration, then map them in the Django adapter.
- [ ] Run the targeted tests and migration drift check.
- [ ] Commit the isolated data contract.

### Task 2: Existing event editor and desk rendering

**Files:** `frontend/demo/components/popup/popup.js`, `frontend/demo/components/workspace/workspace.js`, `frontend/demo/js/core/i18n.js`, `tests/event-visibility.test.js`.

**Interfaces:** `eventVisibleIn(event, desk)` returns true unless the named flag is explicitly false. The form stores both flags on the same event.

- [ ] Add failing tests for independent visibility, editing, and rendering.
- [ ] Run the targeted tests and observe failure.
- [ ] Add two existing-style controls to the event editor and filter the two desk render inputs.
- [ ] Verify the targeted tests and browser matrix: fa/en, 360/1280, light/dark, with no external requests.
- [ ] Commit the isolated UI change.

### Task 3: Docs and acceptance

**Files:** `docs/CHANGES.md`, `docs/next-version/CHANGELOG.md`, `docs/next-version/TEST_REPORT.md`.

- [ ] Record exact surfaces, asset version, tests, and limits.
- [ ] Run relevant Node and Django suites and inspect the diff for unrelated changes.
- [ ] Commit the documentation and report any unverified live PHP/Android behavior.
