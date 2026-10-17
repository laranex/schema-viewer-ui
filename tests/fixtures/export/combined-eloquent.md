# Database schema: mysql (mysql)

Synthetic blog used by the contract fixtures.

Coverage: incomplete (checkConstraints: unavailable, indexExpressions: partial). Only what was read is listed.

11 tables.

## categories

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `parent_id` | bigint unsigned |  |  | FK → categories.id |  |
| `name` | varchar(255) |  |  |  |  |

Indexes:

- `categories_parent_id_index` (parent_id)

Foreign keys:

- `categories_parent_id_foreign`: (parent_id) → categories (id), on update no action, on delete set null

## comments

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `user_id` | bigint unsigned |  |  | FK → users.id |  |
| `commentable_type` | varchar(255) |  |  |  |  |
| `commentable_id` | bigint unsigned |  |  |  |  |
| `body` | text |  |  |  |  |
| `created_at` | timestamp | yes |  |  |  |
| `updated_at` | timestamp | yes |  |  |  |

Indexes:

- `comments_commentable_type_commentable_id_index` (commentable_type, commentable_id)

Foreign keys:

- `comments_user_id_foreign`: (user_id) → users (id), on update no action, on delete cascade

## countries

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `code` | char(2) |  |  | UK |  |

Indexes:

- `countries_code_unique` (code), unique

## jobs

Framework table.

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `queue` | varchar(255) |  |  |  |  |
| `payload` | longtext |  |  |  |  |

Indexes:

- `jobs_queue_index` (queue)

## oauth_clients

Package table: laravel/passport.

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `user_id` | bigint unsigned |  |  |  |  |
| `name` | varchar(255) |  |  |  |  |

Indexes:

- `oauth_clients_user_id_index` (user_id)

## posts

Note: Articles, drafts included.

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `user_id` | bigint unsigned |  |  | FK → users.id |  |
| `editor_id` | bigint unsigned | yes |  |  |  |
| `category_id` | bigint unsigned | yes |  | FK → categories.id |  |
| `title` | varchar(255) |  |  |  | Shown in feeds; keep it short. |
| `status` | enum('draft','published') |  | `'draft'` |  |  |
| `published_at` | timestamp | yes | `CURRENT_TIMESTAMP` |  |  |
| `created_at` | timestamp | yes |  |  |  |
| `updated_at` | timestamp | yes |  |  |  |

Indexes:

- `posts_user_id_index` (user_id)
- `posts_category_id_index` (category_id)
- `posts_status_published_at_index` (status, published_at)

Foreign keys:

- `posts_user_id_foreign`: (user_id) → users (id), on update no action, on delete cascade
- `posts_category_id_foreign`: (category_id) → categories (id), on update no action, on delete set null

## role_user

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `user_id` | bigint unsigned |  |  | PK |  |
| `role_id` | bigint unsigned |  |  | PK |  |
| `assigned_at` | timestamp | yes |  |  |  |

Indexes:

- `role_user_role_id_index` (role_id)

Foreign keys:

- `role_user_user_id_foreign`: (user_id) → users (id), on update no action, on delete cascade
- `role_user_role_id_foreign`: (role_id) → roles (id), on update no action, on delete cascade

## roles

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `name` | varchar(255) |  |  |  |  |

## taggables

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `tag_id` | bigint unsigned |  |  | FK → tags.id |  |
| `taggable_type` | varchar(255) |  |  |  |  |
| `taggable_id` | bigint unsigned |  |  |  |  |

Indexes:

- `taggables_tag_id_index` (tag_id)
- `taggables_taggable_type_taggable_id_index` (taggable_type, taggable_id)

Foreign keys:

- `taggables_tag_id_foreign`: (tag_id) → tags (id), on update no action, on delete cascade

## tags

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `name` | varchar(255) |  |  |  |  |

## users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `country_id` | bigint unsigned |  |  | FK → countries.id |  |
| `email` | varchar(255) |  |  | UK |  |
| `remember_token` | varchar(100) | yes |  |  |  |
| `created_at` | timestamp | yes |  |  |  |
| `updated_at` | timestamp | yes |  |  |  |

Indexes:

- `users_email_unique` (email), unique
- `users_country_id_index` (country_id)

Foreign keys:

- `users_country_id_foreign`: (country_id) → countries (id), on update no action, on delete no action
