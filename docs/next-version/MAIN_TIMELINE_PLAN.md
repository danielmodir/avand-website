# Main workspace timeline — 2026-11-16

Owner approved the phased implementation on 2026-11-16. This first slice covers
NV-01-01 through NV-01-04, not the excluded desks, themes or marketing pages.

## Design and implementation

Keep the existing date filtering and original item references. Merge tasks and
events with a valid explicit startTime into ascending minute order for the
selected day, grouped by hour. Completion and pinning do not move a timed item
out of chronological order. Equal times retain input order (tasks before events).
Reminder time alone is not an event's actual start time.

Keep untimed events and tasks after the timeline; preserve their existing
collapse, pin-first/done-last ordering and desktop preview limits. Habits stay
in their existing section. Reuse taskRow/eventCard and existing delegated actions
so editing, deletion, selection, subtasks and per-day completion keep one model.
Use the same renderItemSections in the workspace, calendar day and day sheet.
No API, database or native Android change is required for this WebView display.
Native home-screen widgets retain their existing layout in this slice.

## Tasks

- [x] Add failing Node tests for mixed chronological order, stable ties, untimed
  items, reminder-only events, invalid legacy times, input immutability, rendering
  and a large day.
- [x] Implement pure planningTimeline(tasks, events) in items.js; reuse existing
  cards in renderItemSections. Add localized labels and token-based CSS.
- [x] Verify Node suite and browser matrix (360/1280, fa/en, light/dark), existing
  completion/edit/delete actions, and external requests. Record actual limits.
- [x] Update checklist, decisions, test report, change logs and asset version;
  commit only this slice, preserving unrelated working changes.

## Review focus

Recurring and date-range items use the selected occurrence date already filtered
by itemsForDate. Malformed times remain visible as untimed. No task status, ID,
recurrence, storage, reminder or API payload changes. Large days sort O(n log n).
Current unrelated working changes must not enter this commit. No deployment.
