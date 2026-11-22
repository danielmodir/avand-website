# Six-theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace previous app themes with six complete, persistent, accessible palettes.

**Architecture:** Extend existing vanilla JS root CSS variables with a synchronous central registry and semantic compatibility aliases. Keep palette and appearance independent in state and account transport.

**Tech Stack:** HTML, CSS custom properties, classic JavaScript, Node tests, Django tests, Chromium browser checks.

**Spec:** docs/superpowers/specs/2026-11-16-six-theme-system-design.md

## Global Constraints
No frontend dependencies or build step; no external runtime requests. Preserve exact palette HEX. Preserve unrelated work. Marketing identity stays unchanged. Both languages, Android WebView and reduced motion supported.

## Review Focus
Legacy persisted IDs; system appearance changes; backend enum validation; overlays and period overrides; actual foreground/background contrast.

## Tasks
- [x] Define the twelve configurations, semantic tokens and contrast tests in themes.js and tests/themes.test.js.
- [x] Connect pre-paint bootstrap, util.js, state.js and events.js; migrate local storage and persist toolbar changes inside the transition callback.
- [x] Replace old CSS skins and accent controls; build localized dual-mode preview cards and independent appearance buttons.
- [x] Update Django palette choices/migration and API system transport; retain PHP opaque settings behavior.
- [x] Run Chromium matrix and behavioral checks, document results, update CHANGES/version and inspect final diff.

Changes overlap preexisting uncommitted user work. Keep the reviewable work uncommitted rather than risk committing unrelated features. Deployment remains separate.
