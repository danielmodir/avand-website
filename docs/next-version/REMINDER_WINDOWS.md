# Custom reminder windows — 2026-11-16

Owner decision: one activity, multiple reminders; no separate completion state
per slot. Applies to task/habit/event reminders, not daily recurrence rules.

## Contract

- `notification.type = repeat`; optional `windowEnd: HH:MM` enables a window.
  `time` is its start; integer `everyMinutes` is 1..1440. Null/absent windowEnd
  retains the existing repeatHours behavior. Equal start/end is invalid.
- End is inclusive only if reached by the interval. Earlier end means the next
  local day. Overnight slots retain the original occurrence date and its status.
- Calculate from stored clock values, independently of UI refresh. Skip missing
  local times at a DST spring gap; use one occurrence of an ambiguous fall time.
- `windowSince` prevents backfilling earlier reminders. Set at activity submission
  for creation or changes to date, daily recurrence or reminder window; retain
  the previous cutoff when only title/text changes. PHP keeps this in JSON;
  Django reads reconstruct the cutoff from the row's `updated_at`.
- One stable slot per original occurrence date and timestamp. Existing shown-slot
  deduplication and replacement of the native/server schedule remain in use.

## Surfaces and rollout

- UI/draft: popup.js; computation and delivery lists: notify.js.
- PHP: sync.php validates new window fields in tasks/habits/events/subtasks;
  existing JSON document storage and api-php adapter need no schema change.
- Django: nullable `reminder_window_end` on existing Reminder mixin; reuse
  `reminder_time` and `reminder_every_minutes`; migration 0009 updates constraints.
  Apply migration before deploying the client against Django. No production
  migration or user-data write has been performed here. A schema rollback would
  remove the new field: export new window settings before considering rollback.
- Django client: reminderToApi/FromApi map the new field. No new auth/provider.

## Verification and remaining limits

- Node cases cover examples, arbitrary minute intervals, invalid bounds, overnight
  identity, DST, no backfill, edit/removal, adapter mapping and submission cutoff.
- Django API tests cover all activity types, invalid data, legacy compatibility,
  overnight, editing/removing reminders and keeping one activity.
- Eight source-browser cases cover fa/en, light/dark, 360/1280, creation, editing,
  invalid zero interval and removal. No external requests/page errors observed.
- PHP CLI is unavailable locally: standalone tests/reminder-windows.php is added
  but NOT executed. Live PHP and actual Android notification delivery untested.
- Existing closed-app scheduling is capped at 400 upcoming slots over 7 days;
  dense windows can exhaust that queue earlier. No unlimited-delivery guarantee.
- Wall times recalculate in the device timezone on schedule refresh. Existing
  native closed-app timezone-change handling does not regenerate JS slots;
  closed-phone timezone refresh and queue refill remain follow-up work. This
  feature is In Progress until those native/background cases are resolved.
