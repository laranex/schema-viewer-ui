import { buildGraph, type SchemaDocument, type Table } from '../src/contract';

// A generated synthetic schema of n tables, each referencing up to two earlier ones, for layout and render checks.
export function large(n: number): SchemaDocument {
    const column = (name: string, type = 'bigint') => ({
        name,
        type,
        typeName: type,
        nullable: false,
        autoIncrement: name === 'id',
        timezone: null,
        collation: null,
        enum: null,
        default: null,
        ormDefault: null,
        generated: null,
        comment: null,
        note: null,
        provenance: ['database' as const],
    });
    const tables: Table[] = [];
    for (let i = 0; i < n; i++) {
        const id = `large:t${i}`;
        const refs = [i > 0 ? Math.floor(i / 2) : -1, i > 3 ? (i * 7) % i : -1].filter((r, k, all) => r >= 0 && all.indexOf(r) === k);
        tables.push({
            id,
            name: `table_${String(i).padStart(3, '0')}`,
            schema: null,
            comment: null,
            note: null,
            owner: { kind: 'application', package: null },
            primaryKey: ['id'],
            columns: [column('id'), ...refs.map((r) => column(`table_${r}_id`)), column('name', 'varchar(255)'), column('created_at', 'timestamp')],
            indexes: [],
            foreignKeys: refs.map((r) => ({
                id: `${id}:fk:${r}`,
                name: `t${i}_t${r}_fk`,
                columns: [`table_${r}_id`],
                foreignTable: `large:t${r}`,
                foreignColumns: ['id'],
                onUpdate: null,
                onDelete: 'CASCADE' as const,
                deferrable: null,
                initially: null,
                provenance: ['database' as const],
            })),
            constraints: [],
            provenance: ['database'],
        });
    }
    const base: SchemaDocument = {
        format: 'laranex-schema',
        version: '2.0',
        source: 'database',
        generator: { name: 'dev', orm: null },
        note: null,
        connections: [{ id: 'connection:large', name: 'large', driver: 'postgresql', defaultSchema: 'public', coverage: { database: { complete: true, schemas: ['public'], features: {} }, declared: null }, tables }],
        models: [],
        relationships: [],
        links: [],
        derivedLinks: [],
        diagnostics: [],
        comparisons: [],
        migrations: [],
        inferredAssociations: [],
    };
    return { ...base, ...buildGraph(base) };
}
