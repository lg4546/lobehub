/**
 * DSL Generator Module
 * Generates SQL queries using LLM with Few-shot learning
 */

import type {
  DSLGeneratorInput,
  DSLGeneratorOutput,
  QuerySQLExample,
  SelectedTable,
} from '@/types/text2sql';

import type { VectorStoreService } from '../vector-store';

export interface LLMProvider {
  generate(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
}

export class DSLGenerator {
  private vectorStore: VectorStoreService;
  private llmProvider: LLMProvider;

  constructor(vectorStore: VectorStoreService, llmProvider: LLMProvider) {
    this.vectorStore = vectorStore;
    this.llmProvider = llmProvider;
  }

  /**
   * Generate SQL from natural language query
   */
  async generateSQL(input: DSLGeneratorInput): Promise<DSLGeneratorOutput> {
    const { query, selectedTables, context } = input;

    // Get few-shot examples from vector store
    const queryEmbedding = await this.vectorStore.generateEmbedding(query);
    const fewShotExamples = await this.vectorStore.searchQueryExamples(queryEmbedding, 3);

    // Build prompt
    const prompt = this.buildPrompt(query, selectedTables, fewShotExamples, context);

    // Generate SQL using LLM
    const response = await this.llmProvider.generate(prompt, {
      temperature: 0.1, // Low temperature for more deterministic output
      maxTokens: 1000,
    });

    // Parse response
    const parsedResult = this.parseResponse(response);

    return {
      sql: parsedResult.sql,
      confidence: parsedResult.confidence,
      explanation: parsedResult.explanation,
      usedExamples: fewShotExamples.map((ex) => ex.id),
    };
  }

  /**
   * Build Few-shot prompt for LLM
   */
  private buildPrompt(
    query: string,
    selectedTables: SelectedTable[],
    examples: QuerySQLExample[],
    context?: any,
  ): string {
    const schemaSection = this.buildSchemaSection(selectedTables);
    const examplesSection = this.buildExamplesSection(examples);
    const contextSection = context ? this.buildContextSection(context) : '';

    return `你是一个SQL专家，请根据以下信息生成Doris SQL查询语句。

## 数据库Schema

${schemaSection}

## 相似查询示例

${examplesSection}

${contextSection}

## 当前用户查询

用户问题：${query}

## 要求

1. 必须使用上述Schema中的表和字段
2. 符合Doris SQL语法规范
3. 考虑查询性能优化（合理使用索引、避免全表扫描）
4. 使用标准SQL函数和语法
5. 对于日期处理，使用DATE_SUB、DATE_ADD等函数
6. 对于字符串匹配，使用LIKE或正则表达式
7. 输出格式必须为JSON: {"sql": "...", "confidence": 0.0-1.0, "explanation": "..."}

请生成SQL查询：`;
  }

  /**
   * Build schema section of prompt
   */
  private buildSchemaSection(selectedTables: SelectedTable[]): string {
    return selectedTables
      .map((table) => {
        const { schema } = table;
        const columns = schema.columns
          .map((col) => {
            const parts = [
              `  ${col.name}`,
              col.type,
              col.nullable ? 'NULL' : 'NOT NULL',
              col.comment ? `-- ${col.comment}` : '',
            ];
            return parts.filter(Boolean).join(' ');
          })
          .join('\n');

        const fkInfo = schema.foreignKeys?.length
          ? `\n外键关系：\n${schema.foreignKeys
              .map((fk) => `  ${fk.columnName} -> ${fk.referencedTable}.${fk.referencedColumn}`)
              .join('\n')}`
          : '';

        return `### 表: ${schema.name}${schema.comment ? ` (${schema.comment})` : ''}

列定义：
${columns}${fkInfo}
`;
      })
      .join('\n');
  }

  /**
   * Build examples section of prompt
   */
  private buildExamplesSection(examples: QuerySQLExample[]): string {
    if (examples.length === 0) {
      return '（暂无相似示例）';
    }

    return examples
      .map((example, index) => {
        return `### 示例 ${index + 1}

**用户问题：** ${example.query}

**SQL：**
\`\`\`sql
${example.sql}
\`\`\`
`;
      })
      .join('\n');
  }

  /**
   * Build context section for multi-turn conversation
   */
  private buildContextSection(context: any): string {
    if (!context || !context.history || context.history.length === 0) {
      return '';
    }

    const recentHistory = context.history
      .slice(-3)
      .map((turn: any) => {
        return `**用户：** ${turn.userMessage}
**助手：** ${turn.assistantMessage || ''}
${turn.sql ? `**SQL：** \`${turn.sql}\`` : ''}
`;
      })
      .join('\n');

    return `## 对话历史

${recentHistory}
`;
  }

  /**
   * Parse LLM response to extract SQL and metadata
   */
  private parseResponse(response: string): {
    sql: string;
    confidence: number;
    explanation?: string;
  } {
    try {
      // Try to parse as JSON first
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sql: parsed.sql || '',
          confidence: parsed.confidence || 0.5,
          explanation: parsed.explanation,
        };
      }
    } catch (e) {
      // JSON parsing failed, fall through to regex extraction
    }

    // Try to extract SQL from code blocks
    const sqlMatch = response.match(/```sql\s*([\s\S]*?)\s*```/i);
    if (sqlMatch) {
      return {
        sql: sqlMatch[1].trim(),
        confidence: 0.7,
        explanation: response,
      };
    }

    // Try to find SELECT statement
    const selectMatch = response.match(/(SELECT[\s\S]+?;?)\s*$/i);
    if (selectMatch) {
      return {
        sql: selectMatch[1].trim(),
        confidence: 0.6,
        explanation: response,
      };
    }

    // Failed to parse
    return {
      sql: response,
      confidence: 0.3,
      explanation: 'Failed to parse structured response',
    };
  }

  /**
   * Generate SQL with retry and refinement
   */
  async generateSQLWithRetry(
    input: DSLGeneratorInput,
    maxRetries: number = 2,
  ): Promise<DSLGeneratorOutput> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.generateSQL(input);

        // Basic validation
        if (result.sql && result.sql.trim().length > 0) {
          return result;
        }
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw lastError || new Error('Failed to generate SQL after retries');
  }
}
