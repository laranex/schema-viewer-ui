# Database schema: app (postgresql)

16 tables.

## tenant_a.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_a.audit_events

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `payload` | jsonb |  |  |  |  |

## tenant_a.invoices

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `order_id` | bigint |  |  |  |  |

## tenant_a.line_items

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `order_id` | bigint |  |  | PK |  |
| `line_no` | integer |  |  | PK |  |
| `qty` | integer |  |  |  |  |
| `product_id` | bigint |  |  | FK → tenant_a.products.id |  |

Constraints:

- `line_items_qty_check`: check `((qty > 0))`

Foreign keys:

- `line_items_order_id_fkey`: (order_id) → tenant_a.orders (id), on update not reported, on delete cascade
- `line_items_product_id_fkey`: (product_id) → tenant_a.products (id), on update not reported, on delete not reported

## tenant_a.orders

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  | `nextval('tenant_a.orders_id_seq'::regclass)` | PK |  |
| `user_id` | bigint |  |  | FK → tenant_a.users.id |  |
| `total` | numeric(10,2) |  |  |  |  |
| `placed_at` | timestamp with time zone | yes |  |  |  |

Indexes:

- `orders_user_id_idx` (user_id)
- `orders_placed_at_idx` (placed_at desc)

Constraints:

- `orders_total_check`: check `((total >= (0)::numeric))`

Foreign keys:

- `orders_user_id_fkey`: (user_id) → tenant_a.users (id), on update not reported, on delete cascade

## tenant_a.products

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `name` | text |  |  |  |  |

## tenant_a.settings

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `key` | text |  |  |  |  |
| `value` | text |  |  |  |  |

## tenant_a.users

Tenant users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  | `nextval('tenant_a.users_id_seq'::regclass)` | PK |  |
| `email` | character varying(255) |  |  | UK |  |
| `name` | text |  |  |  |  |
| `status` | character varying(20) |  | `'active'::character varying` |  |  |
| `legacy_code` | text | yes |  |  |  |

Indexes:

- `users_email_key` (email), unique, backs a unique constraint
- `users_name_idx` (name)

Constraints:

- `users_email_key`: unique (email)
- `users_status_check`: check `((status)::text = ANY ((ARRAY['active'::character varying, 'pending'::character varying])::text[]))`

## tenant_b.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_b.audit_events

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  |  |  |
| `payload` | jsonb |  |  |  |  |

## tenant_b.coupons

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `code` | text |  |  |  |  |

## tenant_b.line_items

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `order_id` | bigint |  |  | PK |  |
| `line_no` | integer |  |  | PK |  |
| `variant` | integer |  |  | PK |  |
| `qty` | integer |  |  |  |  |
| `coupon_id` | bigint | yes |  | FK → tenant_b.coupons.id |  |

Foreign keys:

- `line_items_order_id_fkey`: (order_id) → tenant_b.orders (id), on update not reported, on delete cascade
- `line_items_coupon_id_fkey`: (coupon_id) → tenant_b.coupons (id), on update not reported, on delete not reported

## tenant_b.orders

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  | `nextval('tenant_b.orders_id_seq'::regclass)` | PK |  |
| `user_id` | bigint |  |  | FK → tenant_b.users.id |  |
| `total` | numeric(12,2) |  |  |  |  |
| `placed_at` | timestamp with time zone |  |  |  |  |

Indexes:

- `orders_user_idx` (user_id)
- `orders_total_idx` (total)

Constraints:

- `orders_total_check`: check `((total > (0)::numeric))`

Foreign keys:

- `orders_user_id_fkey`: (user_id) → tenant_b.users (id), on update not reported, on delete restrict

## tenant_b.refunds

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `order_id` | bigint |  |  |  |  |

## tenant_b.settings

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `key` | text |  |  | PK |  |
| `value` | text |  |  |  |  |

## tenant_b.users

Users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint auto-increment |  | `nextval('tenant_b.users_id_seq'::regclass)` | PK |  |
| `email` | character varying(255) |  |  | UK |  |
| `name` | text |  |  | UK |  |
| `status` | character varying(20) |  | `'pending'::character varying` |  |  |
| `phone` | text | yes |  |  | E.164 |

Indexes:

- `users_email_key` (email), unique, backs a unique constraint
- `users_name_idx` (name), unique

Constraints:

- `users_email_key`: unique (email)
- `users_status_check`: check `((status)::text = ANY ((ARRAY['active'::character varying, 'pending'::character varying])::text[]))`
