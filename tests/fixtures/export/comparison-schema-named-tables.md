# Database schema: ledger (postgresql)

3 tables.

## archive.archive

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |

## archive.billing

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |

## billing.billing

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `archive` | text | yes |  |  |  |

Indexes:

- `archive` (archive)
