# Database schema: default (unknown driver)

From ORM declarations only; no database was inspected.

6 tables.

## customer_tags

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `customer_id` | INTEGER |  |  | PK |  |
| `tag_id` | INTEGER |  |  | PK |  |

Foreign keys:

- `fk_customer_tags_customer`: (customer_id) → customers (id), on update not reported, on delete cascade
- `fk_customer_tags_tag`: (tag_id) → tags (id), on update not reported, on delete cascade

## customers

Buyers

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER |  |  | PK |  |
| `email` | VARCHAR(255) |  |  | UK | Login address |
| `active` | BOOLEAN |  | `true` |  |  |
| `status` | customer_status (enum customer_status: active, closed) |  |  |  |  |
| `created_at` | DATETIME |  |  |  |  |

Indexes:

- `uq_customers_active_email` (email), unique
- `ix_customers_lower_email` (`lower(email)`)

Constraints:

- `ck_customers_email_length`: check `length(email) > 3`

## products

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `sku` | VARCHAR(32) |  |  | PK |  |
| `region` | CHAR(2) |  |  | PK |  |
| `price` | NUMERIC(10, 2) |  |  |  |  |

## sales.order_lines

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `order_id` | INTEGER |  |  | PK |  |
| `line_no` | INTEGER |  |  | PK |  |
| `product_sku` | VARCHAR(32) |  |  | FK → products.sku |  |
| `product_region` | CHAR(2) |  |  | FK → products.region |  |
| `quantity` | INTEGER |  |  |  |  |

Foreign keys:

- `fk_order_lines_order`: (order_id) → sales.orders (id), on update not reported, on delete cascade, deferrable, initially deferred
- `fk_order_lines_product`: (product_sku, product_region) → products (sku, region), on update not reported, on delete not reported

## sales.orders

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER |  |  | PK |  |
| `customer_id` | INTEGER |  |  | FK → customers.id |  |
| `referrer_email` | VARCHAR(255) | yes |  |  |  |
| `legacy_ref` | VARCHAR(20) | yes |  |  |  |

Indexes:

- `ix_orders_customer_id` (customer_id)

Foreign keys:

- `fk_orders_customer`: (customer_id) → customers (id), on update cascade, on delete restrict

## tags

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | INTEGER |  |  | PK |  |
| `label` | VARCHAR(40) |  |  | UK |  |

Constraints:

- `uq_tags_label`: unique (label)
