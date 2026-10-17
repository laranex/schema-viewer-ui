# Database schema: mysql (mysql)

Project note.

4 tables.

## users

People who sign in

Note: Accounts table.

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `email` | varchar(255) |  |  | UK | Login name |
| `status` | varchar(20) |  | `'active'` |  |  |

Indexes:

- `users_email_unique` (email), unique
- `users_lower_email_index` (`lower(email)`)
- `users_active_partial` (status), partial

## profiles

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `user_id` | bigint unsigned |  |  | FK → users.id |  |

Indexes:

- `profiles_user_id_unique` (user_id), unique

Foreign keys:

- `profiles_user_id_foreign`: (user_id) → users (id), on update no action, on delete cascade

## role_user

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `user_id` | bigint unsigned |  |  | PK |  |
| `role_id` | bigint unsigned |  |  | PK |  |
| `meta data` | json | yes |  |  | Has a \| pipe |

Indexes:

- `role_user_role_id_index` (role_id)

Foreign keys:

- `role_user_user_id_foreign`: (user_id) → users (id), on update cascade, on delete cascade

## jobs

Framework table.

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | integer auto-increment |  |  | PK |  |
