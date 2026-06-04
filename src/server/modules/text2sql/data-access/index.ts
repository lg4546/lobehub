/**
 * Data Access Layer Module
 * Handles query execution with permission filtering and data masking
 */

import type { DataAccessInput, DataAccessOutput, QueryResult, UserPermissions } from '@/types/text2sql';

export interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<any[]>;
  close(): Promise<void>;
}

export class DataAccessLayer {
  private connection: DatabaseConnection;
  private cacheProvider?: CacheProvider;

  constructor(connection: DatabaseConnection, cacheProvider?: CacheProvider) {
    this.connection = connection;
    this.cacheProvider = cacheProvider;
  }

  /**
   * Execute SQL query with permission filtering
   */
  async executeQuery(input: DataAccessInput): Promise<DataAccessOutput> {
    const { sql, userId, permissions } = input;

    // Apply row-level security
    const filteredSQL = this.applyRowLevelSecurity(sql, permissions);

    // Check cache
    if (this.cacheProvider) {
      const cacheKey = this.generateCacheKey(filteredSQL, userId);
      const cached = await this.cacheProvider.get(cacheKey);
      if (cached) {
        return {
          result: cached,
          filtered: true,
          appliedRules: ['cache', ...(cached.appliedRules || [])],
        };
      }
    }

    // Execute query
    const rawResult = await this.connection.query(filteredSQL);

    // Apply column-level security (field masking)
    const maskedResult = this.maskSensitiveFields(rawResult, permissions);

    // Build result
    const result: QueryResult = {
      data: maskedResult,
      columns: maskedResult.length > 0 ? Object.keys(maskedResult[0]) : [],
      rowCount: maskedResult.length,
    };

    // Cache result
    if (this.cacheProvider) {
      const cacheKey = this.generateCacheKey(filteredSQL, userId);
      await this.cacheProvider.set(cacheKey, result, 300); // 5 minutes TTL
    }

    return {
      result,
      filtered: filteredSQL !== sql,
      appliedRules: this.extractAppliedRules(sql, filteredSQL, permissions),
    };
  }

  /**
   * Apply row-level security filters
   */
  private applyRowLevelSecurity(sql: string, permissions: UserPermissions): string {
    let modifiedSQL = sql;

    // Apply tenant isolation
    if (permissions.tenantId) {
      modifiedSQL = this.injectTenantFilter(modifiedSQL, permissions.tenantId);
    }

    // Apply table-specific row filters
    for (const [table, filter] of Object.entries(permissions.rowLevelFilters)) {
      modifiedSQL = this.injectRowFilter(modifiedSQL, table, filter);
    }

    return modifiedSQL;
  }

  /**
   * Inject tenant filter into SQL
   */
  private injectTenantFilter(sql: string, tenantId: string): string {
    // Find tables in FROM and JOIN clauses
    const tablePattern = /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)|JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    const tables = new Set<string>();

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = tablePattern.exec(sql)) !== null) {
      const tableName = match[1] || match[2];
      tables.add(tableName);
    }

    // Check if WHERE clause exists
    const hasWhere = /WHERE/i.test(sql);

    if (!hasWhere) {
      // Add WHERE clause
      const insertPoint = sql.search(/GROUP\s+BY|ORDER\s+BY|LIMIT|$/i);
      const tenantFilter = Array.from(tables)
        .map((table) => `${table}.tenant_id = '${tenantId}'`)
        .join(' AND ');
      return `${sql.slice(0, insertPoint)} WHERE ${tenantFilter} ${sql.slice(insertPoint)}`;
    } else {
      // Inject into existing WHERE clause
      const whereMatch = sql.match(/WHERE\s+(.*?)(?:GROUP\s+BY|ORDER\s+BY|LIMIT|$)/is);
      if (whereMatch) {
        const tenantFilter = Array.from(tables)
          .map((table) => `${table}.tenant_id = '${tenantId}'`)
          .join(' AND ');
        const newWhere = `WHERE (${whereMatch[1]}) AND (${tenantFilter})`;
        return sql.replace(/WHERE\s+.*?(?=GROUP\s+BY|ORDER\s+BY|LIMIT|$)/is, newWhere);
      }
    }

    return sql;
  }

  /**
   * Inject row-level filter for specific table
   */
  private injectRowFilter(sql: string, table: string, filter: string): string {
    // Check if table is used in query
    const tableRegex = new RegExp(`\\b${table}\\b`, 'i');
    if (!tableRegex.test(sql)) {
      return sql;
    }

    // Check if WHERE clause exists
    const hasWhere = /WHERE/i.test(sql);

    if (!hasWhere) {
      const insertPoint = sql.search(/GROUP\s+BY|ORDER\s+BY|LIMIT|$/i);
      return `${sql.slice(0, insertPoint)} WHERE ${table}.${filter} ${sql.slice(insertPoint)}`;
    } else {
      const whereMatch = sql.match(/WHERE\s+(.*?)(?:GROUP\s+BY|ORDER\s+BY|LIMIT|$)/is);
      if (whereMatch) {
        const newWhere = `WHERE (${whereMatch[1]}) AND (${table}.${filter})`;
        return sql.replace(/WHERE\s+.*?(?=GROUP\s+BY|ORDER\s+BY|LIMIT|$)/is, newWhere);
      }
    }

    return sql;
  }

  /**
   * Mask sensitive fields in result
   */
  private maskSensitiveFields(data: any[], permissions: UserPermissions): any[] {
    if (data.length === 0) return data;

    return data.map((row) => {
      const maskedRow = { ...row };

      // Check each field against sensitive field list
      for (const [table, sensitiveFields] of Object.entries(permissions.sensitiveFields)) {
        for (const field of sensitiveFields) {
          // Handle both direct field names and table.field format
          const fieldKey = `${table}.${field}`;
          const simpleFieldKey = field;

          if (maskedRow[fieldKey] !== undefined) {
            maskedRow[fieldKey] = this.maskValue(maskedRow[fieldKey], field);
          }

          if (maskedRow[simpleFieldKey] !== undefined) {
            maskedRow[simpleFieldKey] = this.maskValue(maskedRow[simpleFieldKey], field);
          }
        }
      }

      return maskedRow;
    });
  }

  /**
   * Mask individual value based on field type
   */
  private maskValue(value: any, fieldName: string): string {
    if (value === null || value === undefined) return value;

    const str = String(value);

    // Phone number masking
    if (fieldName.toLowerCase().includes('phone') || fieldName.toLowerCase().includes('mobile')) {
      if (str.length >= 11) {
        return `${str.slice(0, 3)}****${str.slice(-4)}`;
      }
    }

    // Email masking
    if (fieldName.toLowerCase().includes('email')) {
      const [local, domain] = str.split('@');
      if (local && domain) {
        const maskedLocal = local.length > 2 ? `${local[0]}****${local.slice(-1)}` : '****';
        return `${maskedLocal}@${domain}`;
      }
    }

    // ID card masking
    if (fieldName.toLowerCase().includes('idcard') || fieldName.toLowerCase().includes('id_card')) {
      if (str.length >= 18) {
        return `${str.slice(0, 6)}********${str.slice(-4)}`;
      }
    }

    // Bank account masking
    if (fieldName.toLowerCase().includes('account') || fieldName.toLowerCase().includes('card')) {
      if (str.length >= 10) {
        return `${str.slice(0, 4)}****${str.slice(-4)}`;
      }
    }

    // Default masking - show first and last char
    if (str.length > 2) {
      return `${str[0]}****${str.slice(-1)}`;
    }

    return '****';
  }

  /**
   * Format result as markdown
   */
  formatAsMarkdown(result: QueryResult): string {
    if (result.rowCount === 0) {
      return '查询结果为空。';
    }

    const { columns, data } = result;

    // Build markdown table
    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;

    const rows = data.map((row) => {
      const values = columns.map((col) => {
        const value = row[col];
        return value !== null && value !== undefined ? String(value) : '';
      });
      return `| ${values.join(' | ')} |`;
    });

    const table = [header, separator, ...rows].join('\n');

    return `查询结果 (${result.rowCount} 条记录):\n\n${table}`;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(sql: string, userId: string): string {
    // Simple hash function for cache key
    const hash = this.simpleHash(`${sql}:${userId}`);
    return `text2sql:query:${hash}`;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Extract applied security rules
   */
  private extractAppliedRules(
    originalSQL: string,
    filteredSQL: string,
    permissions: UserPermissions,
  ): string[] {
    const rules: string[] = [];

    if (originalSQL !== filteredSQL) {
      rules.push('row_level_security');
    }

    if (permissions.tenantId) {
      rules.push('tenant_isolation');
    }

    if (Object.keys(permissions.sensitiveFields).length > 0) {
      rules.push('field_masking');
    }

    return rules;
  }
}

/**
 * Cache Provider Interface
 */
export interface CacheProvider {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-Memory Cache Provider
 */
export class InMemoryCacheProvider implements CacheProvider {
  private cache: Map<string, { value: any; expiry: number }> = new Map();

  async get(key: string): Promise<any> {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    const expiry = Date.now() + ttl * 1000;
    this.cache.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
