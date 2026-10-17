---
aside: false
---

<PackageIntroduction />

## Why a shared package

The Laranex schema viewers for [Laravel](https://github.com/laranex/laravel-schema-viewer),
[Python](https://github.com/laranex/python-schema-viewer) and [Node.js](https://github.com/laranex/node-schema-viewer)
read schemas in very different ways: Laravel inspects the live database and Eloquent models, Python reads ORM
declarations from SQLAlchemy, SQLModel, Django, Tortoise ORM and Peewee, and Node.js reads Prisma, TypeORM, Drizzle,
Sequelize and MikroORM. This package gives them one place to meet:

- **The contract.** Every producer writes a [`laranex-schema` 1.0](./contract.md) document. Framework-specific
  normalization happens in the producer; the viewer never detects or converts framework formats.
- **The viewer.** One React component and one static bundle render any `laranex-schema` document, so a feature added
  here reaches every framework at once.

## What you can explore

- Tables across several connections and schemas, with columns, types, defaults, comments and notes.
- Primary, composite and foreign keys with referential actions.
- Indexes as first-class entities: key order, expressions, partial predicates, included columns, methods, collations,
  operator classes, and whether an index backs the primary key or a unique constraint.
- Unique and check constraints.
- ORM models and relationships, including pivots, polymorphic and through relationships, kept apart from foreign keys.
- Provenance, drift and coverage: what the database says, what the ORM declares, and what could not be read.
- Diagnostics, with confirmed facts kept apart from heuristic advice.

## What it is not

- It never connects to a database or imports application code; producers do that, at build time.
- It contains no CLI or MCP server; those live in each framework's package.
- It has no adapters for older framework snapshot formats; producers convert their own.
