# Database schema: cache (sqlite)

Synthetic application with three database connections.

1 table.

## sessions

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | varchar |  |  | PK |  |
| `user_id` | bigint | yes |  |  |  |
| `payload` | text |  |  |  |  |

Indexes:

- `sessions_user_id_index` (user_id)
