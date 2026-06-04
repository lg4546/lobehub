/**
 * Orchestrator Module
 * Main coordinator for the Text2SQL system
 * Orchestrates the flow: NLU -> Table Selection -> DSL Generation -> Validation -> Execution
 */

import type {
  OrchestratorInput,
  OrchestratorOutput,
  QueryMetadata,
  QueryResult,
  Text2SQLConfig,
} from '@/types/text2sql';

import type { CacheProvider, DatabaseConnection } from '../data-access';
import { DataAccessLayer } from '../data-access';
import { DialogManager } from '../dialog-manager';
import type { LLMProvider } from '../dsl-generator';
import { DSLGenerator } from '../dsl-generator';
import { NLUModule } from '../nlu';
import { SQLValidator } from '../sql-validator';
import { TableSelector } from '../table-selector';
import type { VectorStoreService } from '../vector-store';

export class Text2SQLOrchestrator {
  private config: Text2SQLConfig;
  private vectorStore: VectorStoreService;
  private tableSelector: TableSelector;
  private dslGenerator: DSLGenerator;
  private sqlValidator: SQLValidator;
  private nluModule: NLUModule;
  private dialogManager: DialogManager;
  private dataAccessLayer: DataAccessLayer;

  constructor(
    config: Text2SQLConfig,
    vectorStore: VectorStoreService,
    llmProvider: LLMProvider,
    dbConnection: DatabaseConnection,
    cacheProvider?: CacheProvider,
  ) {
    this.config = config;
    this.vectorStore = vectorStore;
    this.tableSelector = new TableSelector(vectorStore);
    this.dslGenerator = new DSLGenerator(vectorStore, llmProvider);
    this.sqlValidator = new SQLValidator(vectorStore);
    this.nluModule = new NLUModule();
    this.dialogManager = new DialogManager();
    this.dataAccessLayer = new DataAccessLayer(dbConnection, cacheProvider);
  }

  /**
   * Process user query and return results
   */
  async processQuery(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const startTime = Date.now();
    const { query, userId, sessionId, context: providedContext } = input;

    try {
      // Step 1: Get or create conversation context
      const context = providedContext || this.dialogManager.getContext(sessionId, userId);

      // Step 2: Check if this is a follow-up query
      let resolvedQuery = query;
      if (this.dialogManager.isFollowUpQuery(sessionId, query)) {
        resolvedQuery = this.dialogManager.resolveReferences(sessionId, query);
      }

      // Step 3: NLU Processing
      const nluOutput = await this.nluModule.process({
        query: resolvedQuery,
        context,
      });

      // Update context with NLU results
      this.dialogManager.updateIntent(sessionId, nluOutput.intent.name);
      this.dialogManager.updateEntities(sessionId, nluOutput.entities);

      // Step 4: Table Selection
      const tableSelectorOutput = await this.tableSelector.selectTables({
        query: resolvedQuery,
        context,
        topK: 5,
      });

      if (tableSelectorOutput.tables.length === 0) {
        throw new Error('No relevant tables found for the query');
      }

      // Step 5: DSL Generation
      const dslOutput = await this.dslGenerator.generateSQL({
        query: resolvedQuery,
        selectedTables: tableSelectorOutput.tables,
        context,
      });

      // Step 6: SQL Validation
      const validationOutput = await this.sqlValidator.validate({
        sql: dslOutput.sql,
        query: resolvedQuery,
        schema: tableSelectorOutput.tables.map((t) => t.schema),
      });

      let finalSQL = dslOutput.sql;

      // If validation failed, try to use corrected SQL
      if (!validationOutput.valid && validationOutput.correctedSQL) {
        finalSQL = validationOutput.correctedSQL;

        // Re-validate corrected SQL
        const revalidation = await this.sqlValidator.validate({
          sql: finalSQL,
          query: resolvedQuery,
          schema: tableSelectorOutput.tables.map((t) => t.schema),
        });

        if (!revalidation.valid) {
          // Still invalid, record as error case
          await this.recordErrorCase(
            resolvedQuery,
            dslOutput.sql,
            validationOutput.errors?.[0]?.message || 'Validation failed',
          );

          throw new Error(
            `SQL validation failed: ${validationOutput.errors?.map((e) => e.message).join(', ')}`,
          );
        }
      } else if (!validationOutput.valid) {
        // No correction available
        await this.recordErrorCase(
          resolvedQuery,
          dslOutput.sql,
          validationOutput.errors?.[0]?.message || 'Validation failed',
        );

        throw new Error(
          `SQL validation failed: ${validationOutput.errors?.map((e) => e.message).join(', ')}`,
        );
      }

      // Step 7: Get user permissions (in real app, this would come from auth service)
      const permissions = this.getUserPermissions(userId);

      // Step 8: Execute query with permission filtering
      const dataAccessOutput = await this.dataAccessLayer.executeQuery({
        sql: finalSQL,
        userId,
        permissions,
      });

      // Step 9: Format results as markdown
      const formattedOutput = this.dataAccessLayer.formatAsMarkdown(dataAccessOutput.result);
      dataAccessOutput.result.formattedOutput = formattedOutput;

      // Step 10: Record successful query
      await this.recordSuccessfulQuery(resolvedQuery, finalSQL, dslOutput.confidence);

      // Step 11: Update conversation history
      this.dialogManager.addTurn(sessionId, query, formattedOutput, finalSQL, dataAccessOutput.result);

      // Calculate execution time
      const executionTime = Date.now() - startTime;

      // Build metadata
      const metadata: QueryMetadata = {
        executionTime,
        sql: finalSQL,
        confidence: dslOutput.confidence,
        tablesUsed: tableSelectorOutput.tables.map((t) => t.name),
        cached: dataAccessOutput.appliedRules.includes('cache'),
      };

      return {
        result: dataAccessOutput.result,
        metadata,
      };
    } catch (error) {
      // Record error and update conversation
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      this.dialogManager.addTurn(sessionId, query, `错误: ${errorMessage}`);

      throw error;
    }
  }

  /**
   * Record successful query as example
   */
  private async recordSuccessfulQuery(
    query: string,
    sql: string,
    confidence: number,
  ): Promise<void> {
    try {
      // Only record high-confidence queries
      if (confidence > 0.7) {
        const embedding = await this.vectorStore.generateEmbedding(query);

        await this.vectorStore.addQueryExample({
          id: `example_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          query,
          sql,
          category: this.categorizeQuery(query),
          embedding,
          successRate: 1.0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Failed to record successful query:', error);
    }
  }

  /**
   * Record error case for learning
   */
  private async recordErrorCase(query: string, wrongSQL: string, errorMessage: string): Promise<void> {
    try {
      const embedding = await this.vectorStore.generateEmbedding(query);

      await this.vectorStore.addErrorCase({
        id: `error_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        query,
        wrongSQL,
        correctSQL: '', // To be filled by manual review
        errorType: this.categorizeError(errorMessage),
        errorMessage,
        fixReason: '', // To be filled by manual review
        embedding,
        createdAt: new Date(),
        reviewed: false,
      });
    } catch (error) {
      console.error('Failed to record error case:', error);
    }
  }

  /**
   * Categorize query for organizing examples
   */
  private categorizeQuery(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('客户') || lowerQuery.includes('customer')) {
      return 'customer_query';
    }
    if (lowerQuery.includes('订单') || lowerQuery.includes('order')) {
      return 'order_statistics';
    }
    if (lowerQuery.includes('会员') || lowerQuery.includes('member')) {
      return 'member_analysis';
    }
    if (lowerQuery.includes('产品') || lowerQuery.includes('product')) {
      return 'product_query';
    }
    if (lowerQuery.includes('储值卡') || lowerQuery.includes('card')) {
      return 'card_query';
    }

    return 'general';
  }

  /**
   * Categorize error type
   */
  private categorizeError(errorMessage: string): 'syntax' | 'semantic' | 'performance' | 'permission' {
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes('syntax') || lowerError.includes('语法')) {
      return 'syntax';
    }
    if (
      lowerError.includes('not exist') ||
      lowerError.includes('不存在') ||
      lowerError.includes('not found')
    ) {
      return 'semantic';
    }
    if (lowerError.includes('permission') || lowerError.includes('权限')) {
      return 'permission';
    }

    return 'semantic';
  }

  /**
   * Get user permissions (mock implementation)
   */
  private getUserPermissions(userId: string): any {
    // In real application, this would query the permission service
    return {
      userId,
      allowedTables: ['customers', 'orders', 'products', 'cards', 'members', 'benefits'],
      allowedColumns: {
        customers: ['id', 'name', 'phone', 'email', 'created_at'],
        orders: ['id', 'customer_id', 'amount', 'status', 'created_at'],
        products: ['id', 'name', 'price', 'category'],
        cards: ['id', 'customer_id', 'balance', 'status'],
        members: ['id', 'customer_id', 'level', 'points'],
        benefits: ['id', 'name', 'type', 'value'],
      },
      rowLevelFilters: {},
      sensitiveFields: {
        customers: ['phone', 'email', 'id_card'],
        orders: [],
      },
    };
  }

  /**
   * Get conversation context
   */
  getContext(sessionId: string, userId: string) {
    return this.dialogManager.getContext(sessionId, userId);
  }

  /**
   * Clear conversation context
   */
  clearContext(sessionId: string): void {
    this.dialogManager.clearContext(sessionId);
  }

  /**
   * Get query statistics
   */
  async getStatistics() {
    return {
      activeSessions: this.dialogManager.getActiveSessions().length,
      // Add more statistics as needed
    };
  }

  /**
   * Cleanup old sessions
   */
  cleanupSessions(maxAgeHours: number = 24): number {
    return this.dialogManager.cleanupOldSessions(maxAgeHours);
  }
}
