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
  reportTemplates,
  reports,
  reportShares,
  recipeLibrary,
  recipeLibrarySteps,
  platformSettings,
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
  report_templates: reportTemplates,
  reports,
  report_shares: reportShares,
  recipe_library: recipeLibrary,
  recipe_library_steps: recipeLibrarySteps,
  platform_settings: platformSettings,
  health_check: healthCheck,
} as any;

type EqCondition = { field: string; value: unknown };
type OrderCondition = { field: string; order?: 'asc' | 'desc' };

class QueryBuilder {
  private tableName: string;
  private schema: any;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private selectFields: string[] = ['*'];
  private eqConditions: EqCondition[] = [];
  private inConditions: { field: string; values: unknown[] }[] = [];
  private orderConditions: OrderCondition[] = [];
  private limitCount?: number;
  private offsetCount?: number;
  private insertData?: Record<string, unknown>;
  private updateData?: Record<string, unknown>;
  private returningFields: string[] = ['*'];

  constructor(tableName: string) {
    this.tableName = tableName;
    this.schema = tableSchemaMap[tableName];
  }

  select(fields?: string): QueryBuilder {
    this.action = 'select';
    if (fields) this.selectFields = fields.split(',').map((f) => f.trim());
    return this;
  }

  insert(data?: Record<string, unknown>): QueryBuilder {
    this.action = 'insert';
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

  in(field: string, values: unknown[]): QueryBuilder {
    this.inConditions.push({ field, values });
    return this;
  }

  order(field: string, order?: 'asc' | 'desc'): QueryBuilder {
    this.orderConditions.push({ field, order: order || 'asc' });
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

  maybeSingle(): Promise<{ data: unknown; error: null } | { data: null; error: { message: string } }> {
    return this._execute().then((rows) => {
      if (rows.length === 0) return { data: null, error: null };
      return { data: rows[0], error: null };
    }) as any;
  }

  single(): Promise<{ data: unknown; error: null } | { data: null; error: { message: string } }> {
    return this._execute().then((rows) => {
      if (rows.length === 0) return { data: null, error: { message: 'No data found' } };
      if (rows.length > 1) return { data: null, error: { message: 'Multiple data found' } };
      return { data: rows[0], error: null };
    }) as any;
  }

  then<TResult1 = unknown, TResult2 = unknown>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._execute()
      .then((rows) => ({ data: rows, error: null }))
      .then(onfulfilled as any, onrejected);
  }

  catch<TResult = unknown>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<{ data: unknown; error: null } | TResult> {
    return this._execute()
      .then((rows) => ({ data: rows, error: null }))
      .catch(onrejected) as any;
  }

  async _execute(): Promise<unknown[]> {
    const db = getDb();
    const { and, eq, inArray, asc, desc } = await import('drizzle-orm').then((m) => m);

    const allConditions = [
      ...this.eqConditions.map((c) => eq(this.schema[c.field], c.value)),
      ...this.inConditions.map((c) => inArray(this.schema[c.field], c.values)),
    ];
    const whereClause = allConditions.length > 0 ? and(...allConditions) : undefined;

    switch (this.action) {
      case 'select': {
        const fields = this.selectFields[0] === '*'
          ? this.schema
          : this.selectFields.reduce((acc: any, f) => ({ ...acc, [f]: this.schema[f] }), {});

        let query: any = db.select(fields as any).from(this.schema as any);
        if (whereClause) query = query.where(whereClause);
        if (this.orderConditions.length > 0) {
          const orders = this.orderConditions.map((o) =>
            o.order === 'desc' ? desc(this.schema[o.field]) : asc(this.schema[o.field])
          );
          query = query.orderBy(...orders);
        }
        if (this.limitCount !== undefined) query = query.limit(this.limitCount);
        if (this.offsetCount !== undefined) query = query.offset(this.offsetCount);
        return query as any;
      }
      case 'insert': {
        if (!this.insertData) return [];
        const result = await db.insert(this.schema as any).values(this.insertData as any).returning();
        return result as unknown[];
      }
      case 'update': {
        if (!this.updateData || !whereClause) return [];
        const result = await db
          .update(this.schema as any)
          .set(this.updateData as any)
          .where(whereClause)
          .returning();
        return result as unknown[];
      }
      case 'delete': {
        if (!whereClause) return [];
        const result = await db.delete(this.schema as any).where(whereClause).returning();
        return result as unknown[];
      }
      default:
        return [];
    }
  }
}

class SupabasePgClient {
  from(tableName: string): QueryBuilder {
    return new QueryBuilder(tableName);
  }
}

export { SupabasePgClient };
