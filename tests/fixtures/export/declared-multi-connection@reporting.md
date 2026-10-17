# Database schema: reporting (mysql)

From ORM declarations only; no database was inspected.

2 tables.

## reports

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER |  |  | PK |  |
| `owner_id` | INTEGER |  |  | FK → users.id |  |
| `requested_by` | INTEGER | yes |  |  |  |

Foreign keys:

- `fk_reports_owner`: (owner_id) → users (id), on update not reported, on delete cascade

## users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER |  |  | PK |  |
| `display_name` | VARCHAR(80) |  |  |  |  |
