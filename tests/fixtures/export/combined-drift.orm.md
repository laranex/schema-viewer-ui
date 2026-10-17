# Database schema: default (postgresql)

Coverage: incomplete (checkConstraints: unavailable). Only what was read is listed.

3 tables.

## public.audit_log

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  |  | PK |  |
| `payload` | jsonb |  |  |  |  |

## public.teams

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | integer auto-increment |  |  | PK |  |

## public.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | integer auto-increment |  |  | PK |  |
| `email` | character varying(320) |  |  | UK |  |
| `team_id` | integer | yes |  |  |  |
| `legacy_flag` | boolean | yes |  |  |  |

Indexes:

- `ix_users_email` (email), unique

# ORM declarations

From the ORM's metadata. These are not database constraints: the foreign keys are listed with their tables above.

## Models

- `app.models.Team`: public.teams
- `app.models.User`: public.users

## Relationships

- `User::team`: MANYTOONE, many-to-one, public.users → public.teams, on public.users (team_id) → public.teams (id)
