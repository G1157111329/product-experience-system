/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Supabase-compatible query builder backed by Drizzle ORM + pg driver.
 * Provides a drop-in replacement for @supabase/supabase-js in API routes.
 *
 * Supports the subset of Supabase client methods used in this codebase:
 *   .from(table).select().eq().maybeSingle()
 *   .from(table).select().eq().single()
 *   .from(table).insert().select()
 *   .from(table).update().eq()
 *   .from(table).delete().eq()
 *   .from(table).select().order().limit()
 */

import { getDb } from './pg-db';
import {
  platformUsers,
  platformAuditRequests,
  platformCategories,
  platformProducts,
  standards,
  standardItems,
  experienceTasks,
  checkRecords,
  materials,
  recipes,
  recipeSteps,
  issues,
  issueReEvaluations,
  reportTemplates,
  reports,
  reportShares,
  recipeLibrary,
  recipeLibrarySteps,
  platformSettings,
  securityAuditLogs,
  securityRateLimits,
  aiModelConfigs,
  agentSkillTemplates,
  agentSkillVersions,
  agentSkillAuditLogs,
  healthCheck,
} from './shared/schema';

const tableSchemaMap: Record<string, any> = {
  // Map table name strings to their Drizzle schema references
  platform_users: platformUsers,
  platform_audit_requests: platformAuditRequests,
  platform_categories: platformCategories,
  platform_products: platformProducts,
  standards,
  standard_items: standardItems,
  experience_tasks: experienceTasks,
  check_records: checkRecords,
  materials,
  recipes,
  recipe_steps: recipeSteps,
  issues,
  issue_re_evaluations: issueReEvaluations,
  report_templates: reportTemplates,
  reports,
  report_shares: reportShares,
  recipe_library: recipeLibrary,
  recipe_library_steps: recipeLibrarySteps,
  platform_settings: platformSettings,
  security_audit_logs: securityAuditLogs,
  security_rate_limits: securityRateLimits,
  ai_model_configs: aiModelConfigs,
  agent_skill_templates: agentSkillTemplates,
  agent_skill_versions: agentSkillVersions,
  agent_skill_audit_logs: agentSkillAuditLogs,
  health_check: healthCheck,
} as any;

const tableRelationMap: Record<string, Record<string, RelationConfig>> = {
  standards: {
    standard_items: { schema: standardItems, parentKey: 'id', childKey: 'standard_id', defaultOrder: 'sort_order' },
  },
  recipe_library: {
    recipe_library_steps: { schema: recipeLibrarySteps, parentKey: 'id', childKey: 'recipe_library_id', defaultOrder: 'step_number' },
  },
  check_records: {
    materials: { schema: materials, parentKey: 'id', childKey: 'record_id', defaultOrder: 'created_at' },
  },
  recipes: {
    recipe_steps: { schema: recipeSteps, parentKey: 'id', childKey: 'recipe_id', defaultOrder: 'step_number' },
  },
};

type DbError = { message: string; code?: string };
type QueryResult = { data: unknown; error: DbError | null; count?: number | null };
type EqCondition = { field: string; value: unknown };
type CompareCondition = { field: string; value: unknown };
type OrderCondition = { field: string; order?: 'asc' | 'desc'; referencedTable?: string };
type QueryHelpers = Awaited<ReturnType<typeof loadQueryHelpers>>;
type RelationConfig = {
  schema: any;
  parentKey: string;
  childKey: string;
  defaultOrder?: string;
};

async function loadQueryHelpers() {
  const { and, or, eq, ne, gte, lte, ilike, inArray, isNull, asc, desc, count } = await import('drizzle-orm');
  return { and, or, eq, ne, gte, lte, ilike, inArray, isNull, asc, desc, count };
}

function toCamelCase(value: string) {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function resolveColumn(schema: any, field: string) {
  return schema[field] || schema[toCamelCase(field)];
}

function normalizeWriteData(schema: any, data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [schema[key] ? key : toCamelCase(key), value])
  );
}

function normalizeWriteRows(schema: any, data: Record<string, unknown> | Record<string, unknown>[]) {
  return Array.isArray(data)
    ? data.map((row) => normalizeWriteData(schema, row))
    : normalizeWriteData(schema, data);
}

function normalizeReadRow(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;

  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [
      toSnakeCase(key),
      value,
    ])
  );
}

function normalizeReadRows(rows: unknown[]) {
  return rows.map(normalizeReadRow);
}

function parseNestedSelect(field: string) {
  const match = field.match(/^([a-zA-Z0-9_]+)\((\*|count)\)$/);
  if (!match) return null;
  return { relationName: match[1], mode: match[2] as '*' | 'count' };
}

function normalizeDbError(error: unknown): DbError {
  const err = error as { message?: string; code?: string; cause?: { code?: string; message?: string } };
  return {
    message: err?.message || err?.cause?.message || 'Database query failed',
    code: err?.code || err?.cause?.code,
  };
}

function decodeFilterValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

class QueryBuilder {
  private tableName: string;
  private schema: any;
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectFields: string[] = ['*'];
  private eqConditions: EqCondition[] = [];
  private neqConditions: EqCondition[] = [];
  private gteConditions: CompareCondition[] = [];
  private lteConditions: CompareCondition[] = [];
  private ilikeConditions: CompareCondition[] = [];
  private isConditions: EqCondition[] = [];
  private inConditions: { field: string; values: unknown[] }[] = [];
  private orExpressions: string[] = [];
  private orderConditions: OrderCondition[] = [];
  private limitCount?: number;
  private offsetCount?: number;
  private wantsExactCount = false;
  private insertData?: Record<string, unknown> | Record<string, unknown>[];
  private updateData?: Record<string, unknown>;
  private returningFields: string[] = ['*'];

  constructor(tableName: string) {
    this.tableName = tableName;
    this.schema = tableSchemaMap[tableName];
  }

  select(fields?: string, options?: { count?: 'exact' }): QueryBuilder {
    if (options?.count === 'exact') this.wantsExactCount = true;
    if (this.action === 'select') {
      this.action = 'select';
      if (fields) this.selectFields = fields.split(',').map((f) => f.trim());
      return this;
    }

    if (fields) this.returningFields = fields.split(',').map((f) => f.trim());
    return this;
  }

  insert(data?: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder {
    this.action = 'insert';
    if (data) this.insertData = data;
    return this;
  }

  upsert(data?: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder {
    this.action = 'upsert';
    if (data) this.insertData = data;
    return this;
  }

  update(data?: Record<string, unknown>): QueryBuilder {
    this.action = 'update';
    if (data) this.updateData = data;
    return this;
  }

  delete(): QueryBuilder {
    this.action = 'delete';
    return this;
  }

  eq(field: string, value: unknown): QueryBuilder {
    this.eqConditions.push({ field, value });
    return this;
  }

  neq(field: string, value: unknown): QueryBuilder {
    this.neqConditions.push({ field, value });
    return this;
  }

  gte(field: string, value: unknown): QueryBuilder {
    this.gteConditions.push({ field, value });
    return this;
  }

  lte(field: string, value: unknown): QueryBuilder {
    this.lteConditions.push({ field, value });
    return this;
  }

  ilike(field: string, value: unknown): QueryBuilder {
    this.ilikeConditions.push({ field, value });
    return this;
  }

  is(field: string, value: unknown): QueryBuilder {
    this.isConditions.push({ field, value });
    return this;
  }

  in(field: string, values: unknown[]): QueryBuilder {
    this.inConditions.push({ field, values });
    return this;
  }

  or(expression: string): QueryBuilder {
    this.orExpressions.push(expression);
    return this;
  }

  order(field: string, order?: 'asc' | 'desc' | { ascending?: boolean; referencedTable?: string }): QueryBuilder {
    const direction = typeof order === 'object'
      ? order.ascending === false ? 'desc' : 'asc'
      : order || 'asc';
    this.orderConditions.push({ field, order: direction, referencedTable: typeof order === 'object' ? order.referencedTable : undefined });
    return this;
  }

  limit(count: number): QueryBuilder {
    this.limitCount = count;
    return this;
  }

  offset(count: number): QueryBuilder {
    this.offsetCount = count;
    return this;
  }

  range(from: number, to: number): QueryBuilder {
    this.offsetCount = Math.max(0, from);
    this.limitCount = Math.max(0, to - from + 1);
    return this;
  }

  maybeSingle(): Promise<QueryResult> {
    return this._execute().then((rows) => {
      if (rows.length === 0) return { data: null, error: null };
      return { data: rows[0], error: null };
    }).catch((error) => ({ data: null, error: normalizeDbError(error) })) as any;
  }

  single(): Promise<QueryResult> {
    return this._execute().then((rows) => {
      if (rows.length === 0) return { data: null, error: { message: 'No data found' } };
      if (rows.length > 1) return { data: null, error: { message: 'Multiple data found' } };
      return { data: rows[0], error: null };
    }).catch((error) => ({ data: null, error: normalizeDbError(error) })) as any;
  }

  then<TResult1 = unknown, TResult2 = unknown>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._executeWithCount()
      .catch((error) => ({ data: null, error: normalizeDbError(error), count: null }))
      .then(onfulfilled as any, onrejected);
  }

  catch<TResult = unknown>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<QueryResult | TResult> {
    return this._executeWithCount()
      .catch(onrejected) as any;
  }

  private buildWhereClause(helpers: QueryHelpers) {
    const { and, or, eq, ne, gte, lte, ilike, inArray, isNull } = helpers;
    const allConditions: any[] = [
      ...this.eqConditions.map((c) => eq(resolveColumn(this.schema, c.field), c.value)),
      ...this.neqConditions.map((c) => ne(resolveColumn(this.schema, c.field), c.value)),
      ...this.gteConditions.map((c) => gte(resolveColumn(this.schema, c.field), c.value)),
      ...this.lteConditions.map((c) => lte(resolveColumn(this.schema, c.field), c.value)),
      ...this.ilikeConditions.map((c) => ilike(resolveColumn(this.schema, c.field), String(c.value))),
      ...this.isConditions.map((c) =>
        c.value === null ? isNull(resolveColumn(this.schema, c.field)) : eq(resolveColumn(this.schema, c.field), c.value)
      ),
      ...this.inConditions.map((c) => inArray(resolveColumn(this.schema, c.field), c.values)),
      ...this.orExpressions
        .map((expression) => {
          const clauses = expression
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
              const [field, operator, ...valueParts] = part.split('.');
              const value = valueParts.join('.');
              const column = resolveColumn(this.schema, field);

              if (!column) return null;
              if (operator === 'eq') return eq(column, decodeFilterValue(value));
              if (operator === 'ilike') return ilike(column, decodeFilterValue(value));
              if (operator === 'is' && value === 'null') return isNull(column);
              return null;
            })
            .filter(Boolean);

          return clauses.length > 0 ? or(...(clauses as any[])) : null;
        })
        .filter(Boolean),
    ];
    return allConditions.length > 0 ? and(...allConditions) : undefined;
  }

  private async _executeCount(): Promise<number | null> {
    if (!this.wantsExactCount || this.action !== 'select') return null;
    const db = getDb();
    const helpers = await loadQueryHelpers();
    const whereClause = this.buildWhereClause(helpers);
    let query: any = db.select({ value: helpers.count() }).from(this.schema as any);
    if (whereClause) query = query.where(whereClause);
    const rows = await query as Array<{ value: number | string | bigint }>;
    return Number(rows[0]?.value || 0);
  }

  private async _executeWithCount(): Promise<QueryResult> {
    const [rows, exactCount] = await Promise.all([
      this._execute(),
      this._executeCount(),
    ]);
    return { data: rows, error: null, count: exactCount ?? rows.length };
  }

  async _execute(): Promise<unknown[]> {
    const db = getDb();
    const helpers = await loadQueryHelpers();
    const { inArray, asc, desc } = helpers;

    if (!this.schema) throw new Error(`Unknown table: ${this.tableName}`);

    const whereClause = this.buildWhereClause(helpers);

    switch (this.action) {
      case 'select': {
        const nestedSelects = this.selectFields.map(parseNestedSelect).filter(Boolean) as Array<{ relationName: string; mode: '*' | 'count' }>;
        const scalarFields = this.selectFields.filter((field) => !parseNestedSelect(field));
        const fields = scalarFields.includes('*') || scalarFields.length === 0
          ? this.schema
          : scalarFields.reduce((acc: any, f) => ({ ...acc, [toCamelCase(f)]: resolveColumn(this.schema, f) }), {});

        let query: any = db.select(fields as any).from(this.schema as any);
        if (whereClause) query = query.where(whereClause);
        if (this.orderConditions.length > 0) {
          const parentOrders = this.orderConditions
            .filter((o) => !o.referencedTable)
            .map((o) => {
              const column = resolveColumn(this.schema, o.field);
              return column ? (o.order === 'desc' ? desc(column) : asc(column)) : null;
            })
            .filter(Boolean);
          if (parentOrders.length > 0) query = query.orderBy(...parentOrders);
        }
        if (this.limitCount !== undefined) query = query.limit(this.limitCount);
        if (this.offsetCount !== undefined) query = query.offset(this.offsetCount);
        const rows = normalizeReadRows(await query as unknown[]);
        return this.hydrateNestedRows(rows, nestedSelects, { inArray, asc, desc });
      }
      case 'insert': {
        if (!this.insertData) return [];
        const result = await db.insert(this.schema as any).values(normalizeWriteRows(this.schema, this.insertData) as any).returning();
        return normalizeReadRows(result as unknown[]);
      }
      case 'upsert': {
        if (!this.insertData) return [];
        const rows = normalizeWriteRows(this.schema, this.insertData);
        const updateSet = Array.isArray(rows) ? rows[0] : rows;
        const conflictTarget = this.schema.key || this.schema.id;
        let query: any = db.insert(this.schema as any).values(rows as any);
        if (conflictTarget) {
          query = query.onConflictDoUpdate({ target: conflictTarget, set: updateSet as any });
        } else {
          query = query.onConflictDoNothing();
        }
        const result = await query.returning();
        return normalizeReadRows(result as unknown[]);
      }
      case 'update': {
        if (!this.updateData || !whereClause) return [];
        const result = await db
          .update(this.schema as any)
          .set(normalizeWriteData(this.schema, this.updateData) as any)
          .where(whereClause)
          .returning();
        return normalizeReadRows(result as unknown[]);
      }
      case 'delete': {
        if (!whereClause) return [];
        const result = await db.delete(this.schema as any).where(whereClause).returning();
        return normalizeReadRows(result as unknown[]);
      }
      default:
        return [];
    }
  }

  private async hydrateNestedRows(
    rows: unknown[],
    nestedSelects: Array<{ relationName: string; mode: '*' | 'count' }>,
    helpers: { inArray: any; asc: any; desc: any },
  ) {
    if (rows.length === 0 || nestedSelects.length === 0) return rows;

    const db = getDb();
    const relations = tableRelationMap[this.tableName] || {};
    const parentRows = rows as Array<Record<string, unknown>>;

    for (const nested of nestedSelects) {
      const relation = relations[nested.relationName];
      if (!relation) continue;

      const parentIds = parentRows
        .map((row) => row[relation.parentKey])
        .filter((value) => value !== undefined && value !== null);
      if (parentIds.length === 0) {
        for (const row of parentRows) row[nested.relationName] = [];
        continue;
      }

      const childColumn = resolveColumn(relation.schema, relation.childKey);
      let childQuery: any = db
        .select()
        .from(relation.schema as any)
        .where(helpers.inArray(childColumn, parentIds));

      const nestedOrder = this.orderConditions.find((order) =>
        order.referencedTable === nested.relationName ||
        order.referencedTable === nested.relationName.replace(/_/g, '') ||
        order.referencedTable === toCamelCase(nested.relationName)
      );
      const orderField = nestedOrder?.field || relation.defaultOrder;
      const orderColumn = orderField ? resolveColumn(relation.schema, orderField) : null;
      if (orderColumn) {
        childQuery = childQuery.orderBy(nestedOrder?.order === 'desc' ? helpers.desc(orderColumn) : helpers.asc(orderColumn));
      }

      const children = normalizeReadRows(await childQuery as unknown[]) as Array<Record<string, unknown>>;
      const childrenByParent = new Map<unknown, Array<Record<string, unknown>>>();
      for (const child of children) {
        const key = child[relation.childKey];
        const bucket = childrenByParent.get(key) || [];
        bucket.push(child);
        childrenByParent.set(key, bucket);
      }

      for (const row of parentRows) {
        const relatedChildren = childrenByParent.get(row[relation.parentKey]) || [];
        row[nested.relationName] = nested.mode === 'count'
          ? [{ count: relatedChildren.length }]
          : relatedChildren;
      }
    }

    return parentRows;
  }
}

class SupabasePgClient {
  from(tableName: string): QueryBuilder {
    return new QueryBuilder(tableName);
  }
}

export { SupabasePgClient };
