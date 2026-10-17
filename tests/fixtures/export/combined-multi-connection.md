# Database schema: app (postgresql)

Synthetic application with three database connections.

2 tables.

## public.teams

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  |  | PK |  |
| `name` | character varying(255) |  |  |  |  |

## public.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  |  | PK |  |
| `team_id` | bigint | yes |  | FK → public.teams.id |  |
| `email` | character varying(320) |  |  |  |  |

Foreign keys:

- `users_team_id_foreign`: (team_id) → public.teams (id), on update not reported, on delete set null

# Database schema: analytics (mysql)

Coverage: incomplete (checkConstraints: unavailable, indexExpressions: partial). Only what was read is listed.

2 tables.

## events

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  |  | PK |  |
| `user_id` | bigint |  |  | FK → users.id |  |
| `name` | varchar(80) |  |  |  |  |

Indexes:

- `events_user_id_index` (user_id)

Foreign keys:

- `events_user_id_foreign`: (user_id) → users (id), on update not reported, on delete cascade

## users

Visitors, signed in or not

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  |  | PK |  |
| `app_user_id` | bigint | yes |  |  |  |
| `segment` | varchar(40) |  |  |  |  |

# Database schema: cache (sqlite)

1 table.

## sessions

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | varchar |  |  | PK |  |
| `user_id` | bigint | yes |  |  |  |
| `payload` | text |  |  |  |  |

Indexes:

- `sessions_user_id_index` (user_id)
