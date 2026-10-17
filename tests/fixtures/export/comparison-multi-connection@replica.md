# Database schema: replica (mysql)

2 tables.

## customers

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned auto-increment |  |  | PK |  |
| `email` | varchar(255) |  |  |  |  |
| `active` | tinyint(1) |  | `1` |  |  |
| `score` | double |  |  |  |  |
| `created_at` | datetime |  |  |  |  |
| `bio` | longtext | yes |  |  |  |

## orders

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint unsigned |  |  | PK |  |
| `customer_id` | bigint unsigned |  |  | FK → customers.id |  |

Indexes:

- `orders_customer_id_foreign` (customer_id)

Foreign keys:

- `orders_customer_id_foreign`: (customer_id) → customers (id), on update not reported, on delete restrict
