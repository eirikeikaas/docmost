import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
} from 'kysely';
import { compileFilter, compileSort } from './item-query.compiler';

const db = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (k) => new PostgresIntrospector(k),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const properties = [
  { id: 'sel', type: 'select' },
  { id: 'multi', type: 'multi_select' },
  { id: 'num', type: 'number' },
  { id: 'due', type: 'date' },
  { id: 'name', type: 'text' },
  { id: 'done', type: 'checkbox' },
];

const compile = (builder: ReturnType<typeof compileFilter>) =>
  sql`select 1 where ${builder}`.compile(db);

describe('item query compiler', () => {
  it('compiles select equality with bound parameters (never interpolated)', () => {
    const q = compile(
      compileFilter(properties, { propertyId: 'sel', op: 'is', value: "x'; drop table items;--" }),
    );
    expect(q.sql).toContain('props ->> $1::text');
    expect(q.sql).not.toContain('drop table');
    expect(q.parameters).toEqual(['sel', "x'; drop table items;--"]);
  });

  it('casts numbers and dates', () => {
    expect(
      compile(compileFilter(properties, { propertyId: 'num', op: 'gte', value: 3 })).sql,
    ).toContain('::numeric');
    expect(
      compile(
        compileFilter(properties, { propertyId: 'due', op: 'lt', value: '2026-10-01' }),
      ).sql,
    ).toContain('::timestamptz');
  });

  it('uses jsonb containment for multi-select', () => {
    const q = compile(
      compileFilter(properties, { propertyId: 'multi', op: 'contains', value: 'a' }),
    );
    expect(q.sql).toContain('@>');
    expect(q.parameters).toContain('["a"]');
  });

  it('escapes LIKE wildcards in contains', () => {
    const q = compile(
      compileFilter(properties, { propertyId: 'name', op: 'contains', value: '50%_' }),
    );
    expect(q.parameters).toContain('%50\\%\\_%');
  });

  it('handles empty checks without a value', () => {
    expect(
      compile(compileFilter(properties, { propertyId: 'sel', op: 'is_empty' })).sql,
    ).toContain('is null');
  });

  it('rejects unknown properties, unsupported operators and bad operands', () => {
    expect(() =>
      compileFilter(properties, { propertyId: 'zzz', op: 'is', value: 'a' }),
    ).toThrow();
    expect(() =>
      compileFilter(properties, { propertyId: 'done', op: 'gt', value: true }),
    ).toThrow();
    expect(() =>
      compileFilter(properties, { propertyId: 'num', op: 'is', value: '3' }),
    ).toThrow();
  });

  it('compiles sorts with nulls last and rejects multi-select', () => {
    const q = sql`select 1 order by ${compileSort(properties, {
      propertyId: 'num',
      direction: 'desc',
    })}`.compile(db);
    expect(q.sql).toContain('desc nulls last');
    expect(() =>
      compileSort(properties, { propertyId: 'multi', direction: 'asc' }),
    ).toThrow();
  });
});
