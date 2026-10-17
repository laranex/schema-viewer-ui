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
