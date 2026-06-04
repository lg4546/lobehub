/**
 * SQL Validator Module
 * Validates and auto-corrects SQL with syntax, semantic, and security checks
 */

import type {
  PerformanceAnalysis,
  SQLValidatorInput,
  SQLValidatorOutput,
  TableSchema,
  ValidationError,
  ValidationWarning,
} from '@/types/text2sql';

import type { VectorStoreService } from '../vector-store';

export class SQLValidator {
  private vectorStore: VectorStoreService;
  private schemas: Map<string, TableSchema> = new Map();

  constructor(vectorStore: VectorStoreService) {
    this.vectorStore = vectorStore;
  }

  /**
   * Load schemas for validation
   */
  loadSchemas(schemas: TableSchema[]): void {
    this.schemas.clear();
    for (const schema of schemas) {
      this.schemas.set(schema.name, schema);
    }
  }

  /**
   * Validate SQL query
   */
  async validate(input: SQLValidatorInput): Promise<SQLValidatorOutput> {
    const { sql, query, schema } = input;

    // Load schemas if provided
    if (schema && schema.length > 0) {
      this.loadSchemas(schema);
    }

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Syntax validation
    const syntaxErrors = await this.validateSyntax(sql);
    errors.push(...syntaxErrors);

    if (syntaxErrors.length > 0) {
      // Try to auto-correct using error case library
      const corrected = await this.autoCorrect(sql, query, syntaxErrors);
      return {
        valid: false,
        errors,
        correctedSQL: corrected,
      };
    }

    // 2. Semantic validation
    const semanticErrors = this.validateSemantics(sql);
    errors.push(...semanticErrors);

    // 3. Security validation
    const securityErrors = this.validateSecurity(sql);
    errors.push(...securityErrors);

    // 4. Performance analysis
    const performanceAnalysis = this.analyzePerformance(sql);
    warnings.push(...this.generatePerformanceWarnings(performanceAnalysis));

    const valid = errors.length === 0 && securityErrors.length === 0;

    return {
      valid,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      performanceAnalysis,
    };
  }

  /**
   * Validate SQL syntax
   */
  private async validateSyntax(sql: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Basic syntax checks
    const trimmed = sql.trim();

    // Check if SQL is empty
    if (!trimmed) {
      errors.push({
        type: 'syntax',
        message: 'SQL query is empty',
      });
      return errors;
    }

    // Check for unclosed quotes
    const singleQuotes = (trimmed.match(/'/g) || []).length;
    const doubleQuotes = (trimmed.match(/"/g) || []).length;

    if (singleQuotes % 2 !== 0) {
      errors.push({
        type: 'syntax',
        message: 'Unclosed single quote',
        suggestion: 'Check for missing closing quote',
      });
    }

    if (doubleQuotes % 2 !== 0) {
      errors.push({
        type: 'syntax',
        message: 'Unclosed double quote',
        suggestion: 'Check for missing closing quote',
      });
    }

    // Check for balanced parentheses
    let parenCount = 0;
    for (const char of trimmed) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) {
        errors.push({
          type: 'syntax',
          message: 'Unbalanced parentheses',
          suggestion: 'Check for missing opening parenthesis',
        });
        break;
      }
    }

    if (parenCount > 0) {
      errors.push({
        type: 'syntax',
        message: 'Unbalanced parentheses',
        suggestion: 'Check for missing closing parenthesis',
      });
    }

    // Check for valid SQL statement type
    const upperSQL = trimmed.toUpperCase();
    if (
      !upperSQL.startsWith('SELECT') &&
      !upperSQL.startsWith('WITH') &&
      !upperSQL.startsWith('SHOW') &&
      !upperSQL.startsWith('DESCRIBE')
    ) {
      errors.push({
        type: 'syntax',
        message: 'Invalid SQL statement type',
        suggestion: 'Only SELECT, WITH, SHOW, and DESCRIBE statements are allowed',
      });
    }

    return errors;
  }

  /**
   * Validate semantic correctness (tables, columns exist)
   */
  private validateSemantics(sql: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Extract table names from SQL
    const tables = this.extractTableNames(sql);

    for (const tableName of tables) {
      if (!this.schemas.has(tableName)) {
        errors.push({
          type: 'semantic',
          message: `Table '${tableName}' does not exist`,
          suggestion: `Available tables: ${Array.from(this.schemas.keys()).join(', ')}`,
        });
      }
    }

    // Extract column references and validate
    const columns = this.extractColumnReferences(sql);

    for (const { table, column } of columns) {
      const schema = this.schemas.get(table);
      if (schema) {
        const columnExists = schema.columns.some((col) => col.name === column);
        if (!columnExists) {
          errors.push({
            type: 'semantic',
            message: `Column '${column}' does not exist in table '${table}'`,
            suggestion: `Available columns: ${schema.columns.map((c) => c.name).join(', ')}`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate security (SQL injection, unauthorized access)
   */
  private validateSecurity(sql: string): ValidationError[] {
    const errors: ValidationError[] = [];

    const upperSQL = sql.toUpperCase();

    // Check for dangerous keywords
    const dangerousKeywords = [
      'DROP',
      'DELETE',
      'UPDATE',
      'INSERT',
      'TRUNCATE',
      'ALTER',
      'CREATE',
      'GRANT',
      'REVOKE',
      'EXEC',
      'EXECUTE',
    ];

    for (const keyword of dangerousKeywords) {
      if (upperSQL.includes(keyword)) {
        errors.push({
          type: 'security',
          message: `Dangerous keyword '${keyword}' detected`,
          suggestion: 'Only read-only queries are allowed',
        });
      }
    }

    // Check for potential SQL injection patterns
    const injectionPatterns = [
      /--/g, // SQL comments
      /;.*?(DROP|DELETE|UPDATE|INSERT)/gi, // Multiple statements
      /UNION.*?SELECT/gi, // UNION injection
      /\bOR\b.*?=.*?=/gi, // OR-based injection (basic check)
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(sql)) {
        errors.push({
          type: 'security',
          message: 'Potential SQL injection pattern detected',
          suggestion: 'Use parameterized queries',
        });
      }
    }

    return errors;
  }

  /**
   * Analyze query performance
   */
  private analyzePerformance(sql: string): PerformanceAnalysis {
    const upperSQL = sql.toUpperCase();

    const indexUsage: PerformanceAnalysis['indexUsage'] = [];
    const recommendations: string[] = [];

    // Extract tables
    const tables = this.extractTableNames(sql);

    for (const tableName of tables) {
      const schema = this.schemas.get(tableName);
      if (schema) {
        // Check if WHERE clause uses indexed columns
        const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:GROUP|ORDER|LIMIT|$)/i);
        const hasIndex =
          schema.indexes && schema.indexes.some((idx) => whereMatch?.[1].includes(idx.columns[0]));

        indexUsage.push({
          table: tableName,
          index: hasIndex ? 'index_used' : undefined,
          type: hasIndex ? 'index' : 'fullscan',
        });

        if (!hasIndex && !upperSQL.includes('LIMIT')) {
          recommendations.push(
            `Consider adding LIMIT clause or using indexed columns in WHERE for table ${tableName}`,
          );
        }
      }
    }

    // Check for SELECT *
    if (upperSQL.includes('SELECT *')) {
      recommendations.push('Avoid SELECT * - specify only needed columns for better performance');
    }

    // Check for subqueries without limits
    const subqueryCount = (sql.match(/\bSELECT\b/gi) || []).length - 1;
    if (subqueryCount > 0 && !upperSQL.includes('LIMIT')) {
      recommendations.push('Consider adding LIMIT to subqueries to improve performance');
    }

    // Estimate cost (simplified)
    const estimatedCost = indexUsage.filter((u) => u.type === 'fullscan').length * 100 + tables.length * 10;

    return {
      estimatedCost,
      indexUsage,
      recommendations,
    };
  }

  /**
   * Generate performance warnings
   */
  private generatePerformanceWarnings(analysis: PerformanceAnalysis): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    if (analysis.estimatedCost > 100) {
      warnings.push({
        type: 'performance',
        message: 'High query cost detected',
        suggestion: analysis.recommendations.join('; '),
      });
    }

    const fullScans = analysis.indexUsage.filter((u) => u.type === 'fullscan');
    if (fullScans.length > 0) {
      warnings.push({
        type: 'performance',
        message: `Full table scan detected for: ${fullScans.map((s) => s.table).join(', ')}`,
        suggestion: 'Consider adding indexes or using WHERE clause with indexed columns',
      });
    }

    return warnings;
  }

  /**
   * Auto-correct SQL using error case library
   */
  private async autoCorrect(
    sql: string,
    query: string,
    errors: ValidationError[],
  ): Promise<string | undefined> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.vectorStore.generateEmbedding(query);

      // Search for similar error cases
      const similarErrors = await this.vectorStore.searchErrorCases(queryEmbedding, 3);

      if (similarErrors.length > 0) {
        // Find the most relevant error case
        const bestMatch = similarErrors[0];

        // Check if error types match
        const errorTypes = new Set(errors.map((e) => e.type));
        if (errorTypes.has(bestMatch.errorType)) {
          return bestMatch.correctSQL;
        }
      }
    } catch (error) {
      console.error('Auto-correct failed:', error);
    }

    return undefined;
  }

  /**
   * Extract table names from SQL
   */
  private extractTableNames(sql: string): string[] {
    const tables = new Set<string>();

    // Match FROM and JOIN clauses
    const patterns = [
      /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    ];

    for (const pattern of patterns) {
      const matches = sql.matchAll(pattern);
      for (const match of matches) {
        tables.add(match[1]);
      }
    }

    return Array.from(tables);
  }

  /**
   * Extract column references from SQL
   */
  private extractColumnReferences(sql: string): Array<{ table: string; column: string }> {
    const references: Array<{ table: string; column: string }> = [];

    // Match table.column patterns
    const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const matches = sql.matchAll(pattern);

    for (const match of matches) {
      references.push({
        table: match[1],
        column: match[2],
      });
    }

    return references;
  }
}
