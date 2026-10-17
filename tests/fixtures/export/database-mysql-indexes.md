# Database schema: shop (mysql)

1 table.

## products

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | int unsigned auto-increment |  |  | PK |  |
| `sku` | varchar(32) |  |  | UK |  |
| `name` | varchar(255) collate utf8mb4_0900_ai_ci |  |  |  | Display name |
| `description` | text | yes |  |  |  |
| `location` | point | yes |  |  |  |
| `status` | enum('draft','live') |  | `'draft'` |  |  |
| `price` | decimal(10,2) |  | `0.00` |  |  |
| `created_at` | datetime |  | `CURRENT_TIMESTAMP` |  |  |
| `attributes` | json | yes |  |  |  |

Indexes:

- `products_sku_unique` (sku), unique
- `products_name_prefix` (name(10))
- `products_status_created` (status, created_at desc)
- `products_color` (`cast(json_unquote(json_extract('attributes',_utf8mb4'$.color')) as char(16))`)
- `products_description_fulltext` (description), fulltext
- `products_location_spatial` (location), spatial
- `products_price` (price)
