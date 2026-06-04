/**
 * Example Usage of Text2SQL System
 * Demonstrates how to set up and use the intelligent query system
 */

import type { TableSchema, Text2SQLConfig } from '@/types/text2sql';

import { InMemoryCacheProvider } from './data-access';
import type { LLMProvider } from './dsl-generator';
import { Text2SQLOrchestrator } from './orchestrator';
import { InMemoryVectorStore } from './vector-store';

/**
 * Example: Create and initialize Text2SQL system
 */
export async function createText2SQLSystem() {
  // 1. Define configuration
  const config: Text2SQLConfig = {
    vectorStore: {
      provider: 'milvus', // or 'qdrant', 'weaviate'
      host: process.env.TEXT2SQL_VECTOR_HOST || 'localhost',
      port: Number.parseInt(process.env.TEXT2SQL_VECTOR_PORT || '19530', 10),
      apiKey: process.env.TEXT2SQL_VECTOR_API_KEY,
      collections: {
        schema: 'text2sql_schema',
        examples: 'text2sql_examples',
        errors: 'text2sql_errors',
      },
    },
    embedding: {
      model: process.env.TEXT2SQL_EMBEDDING_MODEL || 'text-embedding-ada-002',
      dimension: Number.parseInt(process.env.TEXT2SQL_EMBEDDING_DIMENSION || '1536', 10),
      provider: process.env.TEXT2SQL_EMBEDDING_PROVIDER || 'openai',
    },
    llm: {
      provider: process.env.TEXT2SQL_LLM_PROVIDER || 'openai',
      model: process.env.TEXT2SQL_LLM_MODEL || 'gpt-4-turbo',
      temperature: Number.parseFloat(process.env.TEXT2SQL_LLM_TEMPERATURE || '0.1'),
      maxTokens: Number.parseInt(process.env.TEXT2SQL_LLM_MAX_TOKENS || '1000', 10),
    },
    database: {
      type: (process.env.TEXT2SQL_DB_TYPE as any) || 'doris',
      host: process.env.TEXT2SQL_DB_HOST || 'localhost',
      port: Number.parseInt(process.env.TEXT2SQL_DB_PORT || '9030', 10),
      database: process.env.TEXT2SQL_DB_NAME || 'crm',
      username: process.env.TEXT2SQL_DB_USER || 'root',
      password: process.env.TEXT2SQL_DB_PASSWORD || '',
    },
    cache: {
      enabled: process.env.TEXT2SQL_CACHE_ENABLED === 'true',
      ttl: Number.parseInt(process.env.TEXT2SQL_CACHE_TTL || '300', 10),
      provider: (process.env.TEXT2SQL_CACHE_PROVIDER as any) || 'memory',
    },
    security: {
      enableSQLInjectionDetection: process.env.TEXT2SQL_ENABLE_SQL_INJECTION_DETECTION !== 'false',
      enableRowLevelSecurity: process.env.TEXT2SQL_ENABLE_ROW_LEVEL_SECURITY !== 'false',
      sensitiveFieldMasking: process.env.TEXT2SQL_ENABLE_FIELD_MASKING !== 'false',
    },
  };

  // 2. Initialize vector store (using in-memory for demo)
  const vectorStore = new InMemoryVectorStore(config);

  // 3. Create LLM provider (implement this based on your LLM service)
  const llmProvider: LLMProvider = {
    generate: async (prompt: string, options?) => {
      // TODO: Implement actual LLM API call
      // Example: Call OpenAI, Claude, or other LLM service
      console.log('LLM Prompt:', prompt);
      console.log('Options:', options);

      // Placeholder response
      return JSON.stringify({
        sql: 'SELECT * FROM customers LIMIT 10',
        confidence: 0.8,
        explanation: 'Generated SQL query',
      });
    },
  };

  // 4. Create database connection (implement this based on your database)
  const dbConnection = {
    query: async (sql: string) => {
      // TODO: Implement actual database query
      console.log('Executing SQL:', sql);

      // Placeholder response
      return [
        { id: 1, name: 'Customer 1', phone: '13800138000', created_at: '2024-01-01' },
        { id: 2, name: 'Customer 2', phone: '13800138001', created_at: '2024-01-02' },
      ];
    },
    close: async () => {
      // Close database connection
    },
  };

  // 5. Create cache provider
  const cacheProvider = new InMemoryCacheProvider();

  // 6. Initialize orchestrator
  const orchestrator = new Text2SQLOrchestrator(
    config,
    vectorStore,
    llmProvider,
    dbConnection,
    cacheProvider,
  );

  return orchestrator;
}

/**
 * Example: Define CRM database schemas
 */
export function getCRMSchemas(): TableSchema[] {
  return [
    {
      name: 'customers',
      comment: '客户信息表',
      columns: [
        { name: 'id', type: 'INT', nullable: false, comment: '客户ID' },
        { name: 'name', type: 'VARCHAR(100)', nullable: false, comment: '客户姓名' },
        { name: 'phone', type: 'VARCHAR(20)', nullable: true, comment: '手机号' },
        { name: 'email', type: 'VARCHAR(100)', nullable: true, comment: '邮箱' },
        { name: 'level', type: 'VARCHAR(20)', nullable: true, comment: '客户等级' },
        { name: 'created_at', type: 'DATETIME', nullable: false, comment: '创建时间' },
        { name: 'tenant_id', type: 'VARCHAR(50)', nullable: false, comment: '租户ID' },
      ],
      primaryKeys: ['id'],
      indexes: [{ name: 'idx_phone', columns: ['phone'], unique: false }],
    },
    {
      name: 'orders',
      comment: '订单表',
      columns: [
        { name: 'id', type: 'INT', nullable: false, comment: '订单ID' },
        { name: 'customer_id', type: 'INT', nullable: false, comment: '客户ID' },
        { name: 'order_no', type: 'VARCHAR(50)', nullable: false, comment: '订单编号' },
        { name: 'amount', type: 'DECIMAL(10,2)', nullable: false, comment: '订单金额' },
        { name: 'status', type: 'VARCHAR(20)', nullable: false, comment: '订单状态' },
        { name: 'order_date', type: 'DATETIME', nullable: false, comment: '下单时间' },
        { name: 'tenant_id', type: 'VARCHAR(50)', nullable: false, comment: '租户ID' },
      ],
      primaryKeys: ['id'],
      foreignKeys: [{ columnName: 'customer_id', referencedTable: 'customers', referencedColumn: 'id' }],
      indexes: [
        { name: 'idx_customer_id', columns: ['customer_id'], unique: false },
        { name: 'idx_order_date', columns: ['order_date'], unique: false },
      ],
    },
    {
      name: 'products',
      comment: '产品表',
      columns: [
        { name: 'id', type: 'INT', nullable: false, comment: '产品ID' },
        { name: 'name', type: 'VARCHAR(100)', nullable: false, comment: '产品名称' },
        { name: 'category', type: 'VARCHAR(50)', nullable: true, comment: '产品类别' },
        { name: 'price', type: 'DECIMAL(10,2)', nullable: false, comment: '产品价格' },
        { name: 'stock', type: 'INT', nullable: false, comment: '库存数量' },
        { name: 'tenant_id', type: 'VARCHAR(50)', nullable: false, comment: '租户ID' },
      ],
      primaryKeys: ['id'],
      indexes: [{ name: 'idx_category', columns: ['category'], unique: false }],
    },
    {
      name: 'cards',
      comment: '储值卡表',
      columns: [
        { name: 'id', type: 'INT', nullable: false, comment: '储值卡ID' },
        { name: 'customer_id', type: 'INT', nullable: false, comment: '客户ID' },
        { name: 'card_no', type: 'VARCHAR(50)', nullable: false, comment: '卡号' },
        { name: 'balance', type: 'DECIMAL(10,2)', nullable: false, comment: '余额' },
        { name: 'status', type: 'VARCHAR(20)', nullable: false, comment: '状态' },
        { name: 'created_at', type: 'DATETIME', nullable: false, comment: '创建时间' },
        { name: 'tenant_id', type: 'VARCHAR(50)', nullable: false, comment: '租户ID' },
      ],
      primaryKeys: ['id'],
      foreignKeys: [{ columnName: 'customer_id', referencedTable: 'customers', referencedColumn: 'id' }],
      indexes: [{ name: 'idx_card_no', columns: ['card_no'], unique: true }],
    },
    {
      name: 'members',
      comment: '会员表',
      columns: [
        { name: 'id', type: 'INT', nullable: false, comment: '会员ID' },
        { name: 'customer_id', type: 'INT', nullable: false, comment: '客户ID' },
        { name: 'level', type: 'VARCHAR(20)', nullable: false, comment: '会员等级' },
        { name: 'points', type: 'INT', nullable: false, comment: '积分' },
        { name: 'expire_date', type: 'DATE', nullable: true, comment: '过期日期' },
        { name: 'tenant_id', type: 'VARCHAR(50)', nullable: false, comment: '租户ID' },
      ],
      primaryKeys: ['id'],
      foreignKeys: [{ columnName: 'customer_id', referencedTable: 'customers', referencedColumn: 'id' }],
    },
    {
      name: 'benefits',
      comment: '权益表',
      columns: [
        { name: 'id', type: 'INT', nullable: false, comment: '权益ID' },
        { name: 'name', type: 'VARCHAR(100)', nullable: false, comment: '权益名称' },
        { name: 'type', type: 'VARCHAR(50)', nullable: false, comment: '权益类型' },
        { name: 'value', type: 'VARCHAR(100)', nullable: true, comment: '权益价值' },
        { name: 'description', type: 'TEXT', nullable: true, comment: '权益描述' },
        { name: 'tenant_id', type: 'VARCHAR(50)', nullable: false, comment: '租户ID' },
      ],
      primaryKeys: ['id'],
    },
  ];
}

/**
 * Example: Initialize system with schemas
 */
export async function initializeText2SQLSystem() {
  // Create orchestrator
  const orchestrator = await createText2SQLSystem();

  // Load CRM schemas
  const schemas = getCRMSchemas();
  await orchestrator['tableSelector'].loadSchemas(schemas);
  await orchestrator['sqlValidator'].loadSchemas(schemas);

  console.log('Text2SQL system initialized with', schemas.length, 'tables');

  return orchestrator;
}

/**
 * Example: Process queries
 */
export async function exampleUsage() {
  const orchestrator = await initializeText2SQLSystem();

  // Example 1: Simple query
  console.log('\n=== Example 1: Simple Query ===');
  const result1 = await orchestrator.processQuery({
    query: '查询所有客户',
    userId: 'user123',
    sessionId: 'session456',
  });
  console.log('Result:', result1.result.formattedOutput);
  console.log('Metadata:', result1.metadata);

  // Example 2: Aggregation query
  console.log('\n=== Example 2: Aggregation Query ===');
  const result2 = await orchestrator.processQuery({
    query: '统计上个月的订单总额',
    userId: 'user123',
    sessionId: 'session456',
  });
  console.log('Result:', result2.result.formattedOutput);

  // Example 3: Multi-turn conversation
  console.log('\n=== Example 3: Multi-turn Conversation ===');
  const result3a = await orchestrator.processQuery({
    query: '查询上个月消费超过1万的客户',
    userId: 'user123',
    sessionId: 'session789',
  });
  console.log('First query:', result3a.result.formattedOutput);

  const result3b = await orchestrator.processQuery({
    query: '那他们的平均消费金额是多少？',
    userId: 'user123',
    sessionId: 'session789',
  });
  console.log('Follow-up query:', result3b.result.formattedOutput);

  // Cleanup
  orchestrator.cleanupSessions();
}

// Run example if executed directly
if (require.main === module) {
  exampleUsage().catch(console.error);
}
