import type { Column, Index, IndexPart, SchemaDocument } from '../contract/types';
import { actionWords, context, shortClass, sourceWarnings, tableLabel, tablesOf, viewOf, type Context, type TableView } from './common';
import type { Exporter, ExportOptions, ExportResult } from './types';

// A Markdown reference of the database, after Laranex Laravel Schema Viewer's MarkdownExporter: per connection a title,
// the table count, and each table with its columns, indexes, constraints and foreign keys. With { orm: true } the ORM's
// models and relationships and the inferred associations follow in their own section, apart from the foreign keys.

// Text from the schema as plain Markdown: no HTML, no code spans, no table cell broken by a pipe or a line break.
export const mdText = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/`/g, '\\`').replace(/\r\n|\r|\n/g, ' ');

// Text inside a code span, which shows it literally: only a backtick could close it, and a pipe would end a cell.
export const mdCode = (text: string) => `\`${text.replace(/`/g, "'").replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, ' ')}\``;

const joined = (...texts: (string | null)[]) => texts.filter((t): t is string => t !== null).join(' · ');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function exportMarkdown(doc: SchemaDocument, options: ExportOptions = {}): ExportResult {
    const ctx = context(doc, options);
    sourceWarnings(ctx);
    const out: string[] = [];
    ctx.connections.forEach((connection, n) => {
        if (n > 0) {
            out.push('');
        }
        out.push(`# Database schema: ${mdText(connection.name)} (${mdText(connection.driver ?? 'unknown driver')})`, '');
        if (doc.note !== null && n === 0) {
            out.push(mdText(doc.note), '');
        }
        if (doc.source === 'declared') {
            out.push('From ORM declarations only; no database was inspected.', '');
        }
        const coverage = doc.source === 'declared' ? connection.coverage.declared : connection.coverage.database;
        if (coverage && !coverage.complete) {
            const gaps = Object.entries(coverage.features).filter(([, s]) => s === 'partial' || s === 'unavailable');
            out.push(`Coverage: incomplete${gaps.length ? ` (${gaps.map(([f, s]) => `${f}: ${s}`).join(', ')})` : ''}. Only what was read is listed.`, '');
        }
        const tables = tablesOf(ctx, connection);
        out.push(`${plural(tables.length, 'table')}.`);
        for (const table of tables) {
            out.push('', ...tableSection(viewOf(ctx, table)));
        }
    });
    if (options.orm) {
        out.push(...ormSection(ctx));
    }
    return { content: `${out.join('\n')}\n`, warnings: ctx.warnings };
}

function partText(p: IndexPart): string {
    const key = p.column !== null ? mdText(p.column) : mdCode(p.expression ?? '');
    return [
        `${key}${p.length !== null ? `(${p.length})` : ''}`,
        p.collation ? `collate ${mdText(p.collation)}` : '',
        p.opclass ? mdText(p.opclass) : '',
        p.order ?? '',
        p.nulls ? `nulls ${p.nulls}` : '',
    ]
        .filter(Boolean)
        .join(' ');
}

function indexText(index: Index): string {
    const parts = index.parts.map(partText);
    if (index.expression && !index.parts.some((p) => p.expression !== null)) {
        parts.push('an expression not reported');
    }
    const extra = [
        index.unique ? 'unique' : '',
        index.method && index.method.toLowerCase() !== 'btree' ? mdText(index.method) : '',
        index.partial ? `partial${index.predicate !== null ? ` where ${mdCode(index.predicate)}` : ''}` : '',
        index.included.length ? `include (${index.included.map(mdText).join(', ')})` : '',
        index.backs?.kind === 'unique_constraint' ? 'backs a unique constraint' : '',
    ].filter(Boolean);
    return `- ${index.name !== null ? mdCode(index.name) : 'unnamed'} (${parts.join(', ')})${extra.map((e) => `, ${e}`).join('')}`;
}

function typeText(column: Column): string {
    return [
        mdText(column.type),
        column.enum?.name ? `(enum ${mdText(column.enum.name)}: ${column.enum.values.map(mdText).join(', ')})` : '',
        column.collation ? `collate ${mdText(column.collation)}` : '',
        column.autoIncrement ? 'auto-increment' : '',
    ]
        .filter(Boolean)
        .join(' ');
}

function defaultText(column: Column): string {
    if (column.generated !== null) {
        return `generated${column.generated.kind ? ` ${column.generated.kind}` : ''}: ${mdCode(column.generated.expression)}`;
    }
    return column.default !== null ? mdCode(column.default.value) : '';
}

function tableSection(view: TableView): string[] {
    const { table } = view;
    const out = [`## ${mdText(tableLabel(table))}`];
    if (table.owner.kind !== 'application') {
        out.push('', table.owner.kind === 'framework' ? 'Framework table.' : `Package table${table.owner.package ? `: ${mdText(table.owner.package)}` : ''}.`);
    }
    if (table.comment !== null) {
        out.push('', mdText(table.comment));
    }
    if (table.note !== null) {
        out.push('', `Note: ${mdText(table.note)}`);
    }
    const foreign = new Map<string, string>();
    for (const { fk, target } of view.foreignKeys) {
        fk.columns.forEach((c, i) => foreign.has(c) || foreign.set(c, `${tableLabel(target)}.${fk.foreignColumns[i]}`));
    }
    out.push('', '| Column | Type | Null | Default | Key | Comment |', '| --- | --- | --- | --- | --- | --- |');
    for (const column of view.columns) {
        const key = view.primaryKey.includes(column.name) ? 'PK' : foreign.has(column.name) ? `FK → ${mdText(foreign.get(column.name) as string)}` : view.uniqueColumn(column.name) ? 'UK' : '';
        out.push(`| ${mdCode(column.name)} | ${typeText(column)} | ${column.nullable ? 'yes' : ''} | ${defaultText(column)} | ${key} | ${mdText(joined(column.comment, column.note))} |`);
    }
    const indexes = view.indexes.filter((i) => i.backs?.kind !== 'primary_key');
    if (indexes.length) {
        out.push('', 'Indexes:', '', ...indexes.map(indexText));
    }
    if (view.constraints.length) {
        out.push(
            '',
            'Constraints:',
            '',
            ...view.constraints.map((c) => {
                const name = c.name !== null ? mdCode(c.name) : 'unnamed';
                const what = c.kind === 'unique' ? `unique (${[...c.columns.map(mdText), ...(c.expression !== null ? [mdCode(c.expression)] : [])].join(', ')})` : `check ${c.expression !== null ? mdCode(c.expression) : '(expression not reported)'}`;
                return `- ${name}: ${what}`;
            }),
        );
    }
    if (view.foreignKeys.length) {
        out.push(
            '',
            'Foreign keys:',
            '',
            ...view.foreignKeys.map(({ fk, target }) => {
                const deferrable = fk.deferrable ? `, deferrable${fk.initially ? `, initially ${fk.initially.toLowerCase()}` : ''}` : '';
                return `- ${fk.name !== null ? mdCode(fk.name) : 'unnamed'}: (${fk.columns.map(mdText).join(', ')}) → ${mdText(tableLabel(target))} (${fk.foreignColumns.map(mdText).join(', ')}), on update ${actionWords(fk.onUpdate) ?? 'not reported'}, on delete ${actionWords(fk.onDelete) ?? 'not reported'}${deferrable}`;
            }),
        );
    }
    return out;
}

function ormSection(ctx: Context): string[] {
    const { doc } = ctx;
    const tableName = (id: string) => {
        const table = ctx.tables.get(id);
        if (!table) {
            return mdText(id);
        }
        const connection = ctx.connectionOf.get(id);
        return mdText(ctx.several || !ctx.inScope.has(id) ? `${connection?.name ?? ''} · ${tableLabel(table)}` : tableLabel(table));
    };
    const modelName = (id: string) => shortClass(doc.models.find((m) => m.id === id)?.className ?? id);
    const models = doc.models.filter((m) => m.tables.some((t) => ctx.inScope.has(t)));
    const relationships = doc.relationships.filter((r) => ctx.inScope.has(r.table));
    const inferred = doc.inferredAssociations.filter((a) => ctx.inScope.has(a.table));
    const out = ['', '# ORM declarations', '', "From the ORM's metadata. These are not database constraints: the foreign keys are listed with their tables above."];
    out.push('', '## Models', '');
    out.push(...(models.length ? models.map((m) => `- ${mdCode(m.className)}: ${m.tables.map(tableName).join(', ') || 'no table'}${m.source ? ` (${mdText(m.source.file)}${m.source.line !== null ? `:${m.source.line}` : ''})` : ''}`) : ['None.']));
    out.push('', '## Relationships', '');
    out.push(
        ...(relationships.length
            ? relationships.map((r) => {
                  const target = r.relatedTable !== null ? tableName(r.relatedTable) : 'no single table';
                  const how = r.pivot
                      ? `via ${tableName(r.pivot.table)}`
                      : r.through?.length
                        ? `through ${r.through.map(tableName).join(', ')}`
                        : r.keys
                          ? `on ${tableName(r.keys.from.table)} (${r.keys.from.columns.map(mdText).join(', ')}) → ${tableName(r.keys.to.table)} (${r.keys.to.columns.map(mdText).join(', ')})`
                          : r.polymorphic
                            ? `polymorphic on ${mdText(r.polymorphic.typeColumn)}, ${mdText(r.polymorphic.idColumn)}`
                            : 'keys not resolved';
                  return `- ${mdCode(`${modelName(r.model)}::${r.name}`)}: ${mdText(r.type)}, ${r.cardinality}, ${tableName(r.table)} → ${target}, ${how}`;
              })
            : ['None.']),
    );
    if (inferred.length) {
        out.push('', '## Inferred associations', '', 'Inferred from foreign keys; no ORM attribute declares them.', '');
        out.push(
            ...inferred.map((a) => {
                const fks = a.foreignKeys.map((id) => ctx.tables.get(a.table)?.foreignKeys.find((f) => f.id === id)?.name ?? ctx.tables.get(a.via ?? '')?.foreignKeys.find((f) => f.id === id)?.name ?? id);
                return `- ${mdText(`${modelName(a.model)} → ${modelName(a.relatedModel)}`)}: ${a.cardinality}, ${tableName(a.table)} → ${tableName(a.relatedTable)}${a.via ? ` via ${tableName(a.via)}` : ''}, from ${fks.map(mdCode).join(', ')}, ${a.confidence} confidence${a.ambiguities.length ? `, ambiguous: ${a.ambiguities.map(mdText).join(', ')}` : ''}`;
            }),
        );
    }
    return out;
}

export const markdown: Exporter = { id: 'markdown', label: 'Markdown', extension: 'md', mediaType: 'text/markdown', export: exportMarkdown };
