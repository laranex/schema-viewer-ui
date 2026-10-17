// A small description of JSON shapes. Each shape both checks a value and describes itself as JSON Schema, so the
// runtime validator and the distributed schema.json come from one definition and cannot drift apart.

export type JsonSchema = Record<string, unknown>;

// strict: reject properties the shape does not know (producers); otherwise ignore them (readers of a newer minor).
export type Context = { errors: string[]; strict: boolean };

export type Shape = {
    schema: JsonSchema;
    check: (value: unknown, path: string, context: Context) => void;
};

const kindOf = (value: unknown) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

export const string = (options: { minLength?: number; pattern?: string } = {}): Shape => {
    const pattern = options.pattern === undefined ? null : new RegExp(options.pattern, 'u');
    return {
        schema: { type: 'string', ...options },
        check: (value, path, { errors }) => {
            if (typeof value !== 'string') {
                errors.push(`${path}: expected a string, got ${kindOf(value)}`);
            } else if (options.minLength !== undefined && value.length < options.minLength) {
                errors.push(`${path}: expected at least ${options.minLength} characters`);
            } else if (pattern && !pattern.test(value)) {
                errors.push(`${path}: ${JSON.stringify(value)} does not match ${options.pattern}`);
            }
        },
    };
};

export const boolean = (): Shape => ({
    schema: { type: 'boolean' },
    check: (value, path, { errors }) => {
        if (typeof value !== 'boolean') {
            errors.push(`${path}: expected a boolean, got ${kindOf(value)}`);
        }
    },
});

export const integer = (options: { minimum?: number } = {}): Shape => ({
    schema: { type: 'integer', ...options },
    check: (value, path, { errors }) => {
        if (!Number.isInteger(value)) {
            errors.push(`${path}: expected an integer, got ${kindOf(value)}`);
        } else if (options.minimum !== undefined && (value as number) < options.minimum) {
            errors.push(`${path}: expected at least ${options.minimum}`);
        }
    },
});

export const literal = (expected: string | number): Shape => ({
    schema: { const: expected },
    check: (value, path, { errors }) => {
        if (value !== expected) {
            errors.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
        }
    },
});

export const oneOf = (values: readonly string[]): Shape => ({
    schema: { enum: [...values] },
    check: (value, path, { errors }) => {
        if (typeof value !== 'string' || !values.includes(value)) {
            errors.push(`${path}: expected one of ${values.join(', ')}, got ${JSON.stringify(value)}`);
        }
    },
});

export const nullable = (shape: Shape): Shape => ({
    schema: { anyOf: [shape.schema, { type: 'null' }] },
    check: (value, path, context) => {
        if (value !== null) {
            shape.check(value, path, context);
        }
    },
});

export const array = (item: Shape, options: { minItems?: number; uniqueItems?: boolean } = {}): Shape => ({
    schema: { type: 'array', items: item.schema, ...options },
    check: (value, path, context) => {
        if (!Array.isArray(value)) {
            context.errors.push(`${path}: expected an array, got ${kindOf(value)}`);
            return;
        }
        if (options.minItems !== undefined && value.length < options.minItems) {
            context.errors.push(`${path}: expected at least ${options.minItems} items`);
        }
        if (options.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
            context.errors.push(`${path}: expected unique items`);
        }
        value.forEach((v, i) => item.check(v, `${path}[${i}]`, context));
    },
});

export const record = (item: Shape, keys?: readonly string[]): Shape => ({
    schema: keys ? { type: 'object', propertyNames: { enum: [...keys] }, additionalProperties: item.schema } : { type: 'object', additionalProperties: item.schema },
    check: (value, path, context) => {
        if (kindOf(value) !== 'object') {
            context.errors.push(`${path}: expected an object, got ${kindOf(value)}`);
            return;
        }
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
            if (keys && !keys.includes(key)) {
                if (context.strict) {
                    context.errors.push(`${path}: unknown key ${key}`);
                }
                continue;
            }
            item.check(v, `${path}.${key}`, context);
        }
    },
});

// Any JSON value.
export const json = (): Shape => ({
    schema: {},
    check: () => undefined,
});

// A JSON object of anything.
export const jsonObject = (): Shape => ({
    schema: { type: 'object' },
    check: (value, path, { errors }) => {
        if (kindOf(value) !== 'object') {
            errors.push(`${path}: expected an object, got ${kindOf(value)}`);
        }
    },
});

// A reference to a named definition, so the JSON Schema stays readable. The check is the definition's own.
export const ref = (name: string, shape: () => Shape): Shape => ({
    schema: { $ref: `#/$defs/${name}` },
    check: (value, path, context) => shape().check(value, path, context),
});

// An object with these properties: required ones, and optional ones (key ending in ?). Unknown properties are rejected
// in strict mode.
export const object = (fields: Record<string, Shape>): Shape => {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    const entries = Object.entries(fields).map(([key, shape]) => {
        const optional = key.endsWith('?');
        const name = optional ? key.slice(0, -1) : key;
        properties[name] = shape.schema;
        if (!optional) {
            required.push(name);
        }
        return { name, optional, shape };
    });
    return {
        schema: { type: 'object', properties, required, additionalProperties: false },
        check: (value, path, context) => {
            if (kindOf(value) !== 'object') {
                context.errors.push(`${path}: expected an object, got ${kindOf(value)}`);
                return;
            }
            const given = value as Record<string, unknown>;
            for (const { name, optional, shape } of entries) {
                if (!(name in given) || given[name] === undefined) {
                    if (!optional) {
                        context.errors.push(`${path}: missing ${name}`);
                    }
                    continue;
                }
                shape.check(given[name], `${path}.${name}`, context);
            }
            if (context.strict) {
                for (const key of Object.keys(given)) {
                    if (!(key in properties)) {
                        context.errors.push(`${path}: unknown property ${key}`);
                    }
                }
            }
        },
    };
};
