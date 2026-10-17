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
