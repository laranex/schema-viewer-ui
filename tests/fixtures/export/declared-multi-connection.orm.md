# Database schema: default (postgresql)

From ORM declarations only; no database was inspected.

1 table.

## public.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER |  |  | PK |  |
| `email` | VARCHAR(255) |  |  |  |  |

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

# ORM declarations

From the ORM's metadata. These are not database constraints: the foreign keys are listed with their tables above.

## Models

- `app.models.reporting.Report`: reporting · reports
- `app.models.reporting.ReportUser`: reporting · users
- `app.models.User`: default · public.users

## Relationships

- `Report::owner`: MANYTOONE, many-to-one, reporting · reports → reporting · users, on reporting · reports (owner_id) → reporting · users (id)
- `Report::requester`: MANYTOONE, many-to-one, reporting · reports → default · public.users, on reporting · reports (requested_by) → default · public.users (id)
