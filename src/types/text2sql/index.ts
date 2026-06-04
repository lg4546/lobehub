/**
 * Text2SQL System Type Definitions
 * Core types for the intelligent query system
 */

// ============================================================================
// Schema Types
// ============================================================================

export interface TableSchema {
  name: string;
  comment?: string;
  columns: ColumnSchema[];
  primaryKeys: string[];
  foreignKeys?: ForeignKey[];
  indexes?: Index[];
  sampleValues?: Record<string, any[]>;
}

export interface ColumnSchema {
  name: string;
  type: string;
  comment?: string;
  nullable: boolean;
  defaultValue?: any;
  length?: number;
}

export interface ForeignKey {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface Index {
  name: string;
  columns: string[];
  unique: boolean;
}

// ============================================================================
// Vector Store Types
// ============================================================================

export interface SchemaEmbedding {
  id: string;
  tableName: string;
  columnName?: string;
  text: string; // The text that was embedded (table/column name + comment + sample values)
  embedding: number[];
  metadata: {
    type: 'table' | 'column';
    dataType?: string;
    comment?: string;
    sampleValues?: any[];
  };
}

export interface QuerySQLExample {
  id: string;
  query: string;
  sql: string;
  category: string; // e.g., "customer_query", "order_statistics", "member_analysis"
  embedding: number[];
  successRate?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ErrorCase {
  id: string;
  query: string;
  wrongSQL: string;
  correctSQL: string;
  errorType: 'syntax' | 'semantic' | 'performance' | 'permission';
  errorMessage: string;
  fixReason: string;
  embedding: number[];
  createdAt: Date;
  reviewed: boolean;
}

export interface BusinessRule {
  id: string;
  type: 'field_mapping' | 'calculation' | 'permission';
  name: string;
  description: string;
  rule: any; // JSON rule definition
  active: boolean;
}

// ============================================================================
// Table Selector Types
// ============================================================================

export interface TableSelectorInput {
  query: string;
  context?: ConversationContext;
  topK?: number;
}

export interface TableSelectorOutput {
  tables: SelectedTable[];
  confidence: number;
}

export interface SelectedTable {
  name: string;
  schema: TableSchema;
  relevanceScore: number;
  matchedColumns: string[];
}

// ============================================================================
// DSL Generator Types
// ============================================================================

export interface DSLGeneratorInput {
  query: string;
  selectedTables: SelectedTable[];
  context?: ConversationContext;
  fewShotExamples?: QuerySQLExample[];
}

export interface DSLGeneratorOutput {
  sql: string;
  confidence: number;
  explanation?: string;
  usedExamples?: string[];
}

// ============================================================================
// SQL Validator Types
// ============================================================================

export interface SQLValidatorInput {
  sql: string;
  query: string;
  schema: TableSchema[];
}

export interface SQLValidatorOutput {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
  correctedSQL?: string;
  performanceAnalysis?: PerformanceAnalysis;
}

export interface ValidationError {
  type: 'syntax' | 'semantic' | 'security';
  message: string;
  position?: { line: number; column: number };
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'style';
  message: string;
  suggestion?: string;
}

export interface PerformanceAnalysis {
  estimatedCost: number;
  indexUsage: { table: string; index?: string; type: 'fullscan' | 'index' }[];
  recommendations: string[];
}

// ============================================================================
// Dialog Manager Types
// ============================================================================

export interface ConversationContext {
  sessionId: string;
  userId: string;
  history: ConversationTurn[];
  slots: Record<string, any>;
  intent?: string;
  entities?: Entity[];
}

export interface ConversationTurn {
  userMessage: string;
  assistantMessage?: string;
  sql?: string;
  results?: any;
  timestamp: Date;
}

export interface Entity {
  type: string;
  value: any;
  confidence: number;
  position?: { start: number; end: number };
}

// ============================================================================
// NLU Module Types
// ============================================================================

export interface NLUInput {
  query: string;
  context?: ConversationContext;
}

export interface NLUOutput {
  intent: Intent;
  entities: Entity[];
  semanticParse: SemanticParse;
}

export interface Intent {
  name: string;
  confidence: number;
  category: 'query' | 'aggregation' | 'comparison' | 'trend_analysis' | 'export';
}

export interface SemanticParse {
  action: string; // e.g., "select", "count", "sum", "average"
  target: string[]; // e.g., ["customer", "order"]
  conditions: Condition[];
  groupBy?: string[];
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
}

export interface Condition {
  field: string;
  operator: string; // e.g., "=", ">", "<", "LIKE", "IN"
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

// ============================================================================
// Orchestrator Types
// ============================================================================

export interface OrchestratorInput {
  query: string;
  userId: string;
  sessionId: string;
  context?: ConversationContext;
}

export interface OrchestratorOutput {
  result: QueryResult;
  metadata: QueryMetadata;
}

export interface QueryResult {
  data: any[];
  columns: string[];
  rowCount: number;
  formattedOutput?: string; // Markdown formatted
}

export interface QueryMetadata {
  executionTime: number;
  sql: string;
  confidence: number;
  tablesUsed: string[];
  cached: boolean;
}

// ============================================================================
// Data Access Layer Types
// ============================================================================

export interface DataAccessInput {
  sql: string;
  userId: string;
  permissions: UserPermissions;
}

export interface DataAccessOutput {
  result: QueryResult;
  filtered: boolean;
  appliedRules: string[];
}

export interface UserPermissions {
  userId: string;
  tenantId?: string;
  allowedTables: string[];
  allowedColumns: Record<string, string[]>;
  rowLevelFilters: Record<string, string>; // table -> WHERE clause
  sensitiveFields: Record<string, string[]>; // table -> columns to mask
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentExecutionInput {
  agentType: 'customer' | 'order' | 'product' | 'card';
  query: string;
  sql: string;
  context: ConversationContext;
}

export interface AgentExecutionOutput {
  success: boolean;
  data: any;
  error?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface Text2SQLConfig {
  vectorStore: {
    provider: 'milvus' | 'qdrant' | 'weaviate';
    host: string;
    port: number;
    apiKey?: string;
    collections: {
      schema: string;
      examples: string;
      errors: string;
    };
  };
  embedding: {
    model: string;
    dimension: number;
    provider: string;
  };
  llm: {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  database: {
    type: 'doris' | 'mysql' | 'postgresql';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    provider: 'redis' | 'memory';
  };
  security: {
    enableSQLInjectionDetection: boolean;
    enableRowLevelSecurity: boolean;
    sensitiveFieldMasking: boolean;
  };
}
