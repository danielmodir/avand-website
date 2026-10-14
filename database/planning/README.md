# toojibee_planning

The Planning desktop. Tables: `categories`, `tasks` (subtasks via `parent_id`, one level), `task_occurrences` (done / not done per day), `task_exceptions`, `task_attachments` (max 3, files live in core), `habits`, `habit_logs`, `events` (optional time of day), `event_exceptions`.

Triggers enforce: subtask depth = 1, subtasks do not repeat, parent/category/attachments belong to the same user, owner cannot change.
