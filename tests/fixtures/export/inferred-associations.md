# Database schema: app (postgresql)

14 tables.

## public.accounts

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |

## public.friendships

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `user_id` | bigint |  |  | PK |  |
| `friend_id` | bigint |  |  | PK |  |

Foreign keys:

- `friendships_user_id_fkey`: (user_id) → public.users (id), on update not reported, on delete not reported
- `friendships_friend_id_fkey`: (friend_id) → public.users (id), on update not reported, on delete not reported

## public.import_rows

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `user_id` | bigint |  |  | FK → public.users.id |  |

Foreign keys:

- `import_rows_user_id_fkey`: (user_id) → public.users (id), on update not reported, on delete not reported

## public.invoices

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `account_id` | bigint |  |  | FK → public.accounts.id |  |

Foreign keys:

- `invoices_account_id_fkey`: (account_id) → public.accounts (id), on update not reported, on delete not reported

## public.messages

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `sender_id` | bigint |  |  | FK → public.users.id |  |
| `recipient_id` | bigint |  |  | FK → public.users.id |  |

Foreign keys:

- `messages_sender_id_fkey`: (sender_id) → public.users (id), on update not reported, on delete not reported
- `messages_recipient_id_fkey`: (recipient_id) → public.users (id), on update not reported, on delete not reported

## public.order_lines

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `order_region` | text |  |  | FK → public.orders.region |  |
| `order_number` | integer |  |  | FK → public.orders.number |  |

Foreign keys:

- `order_lines_order_fkey`: (order_region, order_number) → public.orders (region, number), on update not reported, on delete not reported

## public.orders

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `region` | text |  |  |  |  |
| `number` | integer |  |  |  |  |

Constraints:

- `orders_region_number_key`: unique (region, number)

## public.passports

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `user_id` | bigint |  |  | FK → public.users.id |  |

Indexes:

- `passports_user_id_idx` (user_id), unique

Foreign keys:

- `passports_user_id_fkey`: (user_id) → public.users (id), on update not reported, on delete not reported

## public.post_tags

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `post_id` | bigint |  |  | PK |  |
| `tag_id` | bigint |  |  | PK |  |

Foreign keys:

- `post_tags_post_id_fkey`: (post_id) → public.posts (id), on update not reported, on delete not reported
- `post_tags_tag_id_fkey`: (tag_id) → public.tags (id), on update not reported, on delete not reported

## public.posts

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `author_id` | bigint |  |  | FK → public.users.id |  |

Foreign keys:

- `posts_author_id_fkey`: (author_id) → public.users (id), on update not reported, on delete not reported

## public.profiles

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `user_id` | bigint |  |  | FK → public.users.id |  |

Constraints:

- `profiles_user_id_key`: unique (user_id)

Foreign keys:

- `profiles_user_id_fkey`: (user_id) → public.users (id), on update not reported, on delete not reported

## public.tags

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |

## public.teams

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |

## public.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `team_id` | bigint |  |  |  |  |
| `manager_id` | bigint |  |  | FK → public.users.id |  |

Foreign keys:

- `users_manager_id_fkey`: (manager_id) → public.users (id), on update not reported, on delete not reported
