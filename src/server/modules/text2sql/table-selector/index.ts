/**
 * Table Selector Module
 * Identifies relevant tables from user queries using schema embeddings
 */

import type {
  SelectedTable,
  TableSchema,
  TableSelectorInput,
  TableSelectorOutput,
} from '@/types/text2sql';

import type { VectorStoreService } from '../vector-store';

export class TableSelector {
  private vectorStore: VectorStoreService;
  private schemaCache: Map<string, TableSchema> = new Map();

  constructor(vectorStore: VectorStoreService) {
    this.vectorStore = vectorStore;
  }

  /**
   * Load table schemas into cache
   */
  async loadSchemas(schemas: TableSchema[]): Promise<void> {
    for (const schema of schemas) {
      this.schemaCache.set(schema.name, schema);

      // Generate and store embedding for table
      const tableText = this.generateTableText(schema);
      const tableEmbedding = await this.vectorStore.generateEmbedding(tableText);

      await this.vectorStore.addSchemaEmbedding({
        id: `table_${schema.name}`,
        tableName: schema.name,
        text: tableText,
        embedding: tableEmbedding,
        metadata: {
          type: 'table',
          comment: schema.comment,
        },
      });

      // Generate and store embeddings for columns
      for (const column of schema.columns) {
        const columnText = this.generateColumnText(schema.name, column.name, column);
        const columnEmbedding = await this.vectorStore.generateEmbedding(columnText);

        await this.vectorStore.addSchemaEmbedding({
          id: `column_${schema.name}_${column.name}`,
          tableName: schema.name,
          columnName: column.name,
          text: columnText,
          embedding: columnEmbedding,
          metadata: {
            type: 'column',
            dataType: column.type,
            comment: column.comment,
          },
        });
      }
    }
  }

  /**
   * Select relevant tables based on user query
   */
  async selectTables(input: TableSelectorInput): Promise<TableSelectorOutput> {
    const { query, topK = 5 } = input;

    // Generate embedding for user query
    const queryEmbedding = await this.vectorStore.generateEmbedding(query);

    // Search for relevant schema embeddings
    const relevantEmbeddings = await this.vectorStore.searchSchemaEmbeddings(
      queryEmbedding,
      topK * 3, // Get more results to filter
    );

    // Group by table and calculate relevance scores
    const tableScores = new Map<string, { score: number; columns: Set<string> }>();

    for (const embedding of relevantEmbeddings) {
      const tableName = embedding.tableName;
      const existing = tableScores.get(tableName) || { score: 0, columns: new Set() };

      // Calculate weighted score based on type
      const weight = embedding.metadata.type === 'table' ? 2.0 : 1.0;
      const similarity = this.vectorStore.cosineSimilarity(queryEmbedding, embedding.embedding);

      existing.score += similarity * weight;

      if (embedding.columnName) {
        existing.columns.add(embedding.columnName);
      }

      tableScores.set(tableName, existing);
    }

    // Sort tables by score and select top K
    const sortedTables = Array.from(tableScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK);

    // Build selected table results
    const selectedTables: SelectedTable[] = sortedTables.map(([tableName, info]) => {
      const schema = this.schemaCache.get(tableName);
      if (!schema) {
        throw new Error(`Schema not found for table: ${tableName}`);
      }

      return {
        name: tableName,
        schema,
        relevanceScore: info.score,
        matchedColumns: Array.from(info.columns),
      };
    });

    // Calculate overall confidence
    const maxScore = selectedTables[0]?.relevanceScore || 0;
    const confidence = maxScore > 0 ? Math.min(maxScore / 2, 1.0) : 0;

    return {
      tables: selectedTables,
      confidence,
    };
  }

  /**
   * Analyze table relationships and suggest JOINs
   */
  async suggestJoins(tables: SelectedTable[]): Promise<
    Array<{
      table1: string;
      table2: string;
      joinType: 'INNER' | 'LEFT' | 'RIGHT';
      condition: string;
    }>
  > {
    const suggestions: Array<{
      table1: string;
      table2: string;
      joinType: 'INNER' | 'LEFT' | 'RIGHT';
      condition: string;
    }> = [];

    // Analyze foreign key relationships
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const table1 = tables[i].schema;
        const table2 = tables[j].schema;

        // Check if table1 has foreign key to table2
        if (table1.foreignKeys) {
          for (const fk of table1.foreignKeys) {
            if (fk.referencedTable === table2.name) {
              suggestions.push({
                table1: table1.name,
                table2: table2.name,
                joinType: 'INNER',
                condition: `${table1.name}.${fk.columnName} = ${table2.name}.${fk.referencedColumn}`,
              });
            }
          }
        }

        // Check if table2 has foreign key to table1
        if (table2.foreignKeys) {
          for (const fk of table2.foreignKeys) {
            if (fk.referencedTable === table1.name) {
              suggestions.push({
                table1: table2.name,
                table2: table1.name,
                joinType: 'INNER',
                condition: `${table2.name}.${fk.columnName} = ${table1.name}.${fk.referencedColumn}`,
              });
            }
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * Generate searchable text for table
   */
  private generateTableText(schema: TableSchema): string {
    const parts = [
      `Table: ${schema.name}`,
      schema.comment ? `Description: ${schema.comment}` : '',
      `Columns: ${schema.columns.map((c) => c.name).join(', ')}`,
    ];

    return parts.filter(Boolean).join('\n');
  }

  /**
   * Generate searchable text for column
   */
  private generateColumnText(tableName: string, columnName: string, column: any): string {
    const parts = [
      `Column: ${tableName}.${columnName}`,
      `Type: ${column.type}`,
      column.comment ? `Description: ${column.comment}` : '',
    ];

    return parts.filter(Boolean).join('\n');
  }

  /**
   * Clear schema cache
   */
  clearCache(): void {
    this.schemaCache.clear();
  }
}
