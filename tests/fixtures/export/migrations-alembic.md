# Database schema: app (postgresql)

20 tables.

## tenant_behind.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_behind.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_branches.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_branches.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_current.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_current.audit_log

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `event` | text |  |  |  |  |

## tenant_current.legacy_import

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `row` | text |  |  |  |  |

## tenant_current.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_diverged.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_diverged.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_locked.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_locked.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_new.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_partial.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_partial.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_partial_new.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_scriptless.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_scriptless.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |

## tenant_unknown.alembic_version

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `version_num` | character varying(32) |  |  | PK |  |

## tenant_unknown.users

| Column | Type | Null | Default | Key | Comment |
| --- | --- | --- | --- | --- | --- |
| `id` | bigint |  |  | PK |  |
| `email` | text |  |  |  |  |
