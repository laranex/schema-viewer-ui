# Database schema: analytics (mysql)

Synthetic application with three database connections.

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
