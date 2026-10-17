# Database schema: main (sqlite)

Coverage: incomplete (checkConstraints: partial). Only what was read is listed.

1 table.

## notes

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER auto-increment |  |  | PK |  |
| `title` | TEXT collate NOCASE |  |  |  |  |
| `slug` | TEXT |  |  | UK |  |
| `archived` | INTEGER |  | `0` |  |  |

Indexes:

- `sqlite_autoindex_notes_1` (slug), unique, backs a unique constraint
- `notes_active_title` (title), partial where `archived = 0`
- `notes_lower_title` (`lower(title)`)
- `notes_title_nocase` (title collate NOCASE desc)

Constraints:

- `notes_slug`: unique (slug)
- `notes_archived_flag`: check `archived IN (0, 1)`
