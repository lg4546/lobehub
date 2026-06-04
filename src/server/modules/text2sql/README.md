# Text2SQL Intelligent Query System

A comprehensive Text2SQL system that converts natural language queries into SQL with advanced features including:

- 🎯 **Table Selector**: Intelligent table selection using schema embeddings
- 🤖 **DSL Generator**: LLM-powered SQL generation with Few-shot learning
- ✅ **SQL Validator**: Comprehensive validation with auto-correction
- 💾 **Vector Knowledge Base**: Schema, query examples, and error case storage
- 💬 **Dialog Manager**: Multi-turn conversation with context tracking
- 🧠 **NLU Module**: Intent recognition and entity extraction
- 🔒 **Data Access Layer**: Row-level security and field masking
- 🎭 **Orchestrator**: Complete query flow coordination

## Architecture

```
User Query
    ↓
Dialog Manager (conversation context)
    ↓
NLU Module (intent recognition, entity extraction)
    ↓
Table Selector (schema embedding matching)
    ↓
DSL Generator (LLM + Few-shot examples)
    ↓
SQL Validator (syntax/semantic/security checks)
    ↓         ↓ Failed
    ↓     Error Case Library → Auto-correct
    ↓         ↓
    ↓←--------┘ Corrected
    ↓ Valid
Data Access Layer (permissions + masking)
    ↓
Query Result (markdown format)
```

## Features

### 1. Table Selector
- Semantic matching between queries and database schema
- Automatic multi-table join inference
- Confidence scoring for table relevance

### 2. DSL Generator
- LLM-driven SQL generation (GPT-4, Claude, etc.)
- Few-shot learning from similar query examples
- Schema-aware prompt engineering
- Support for complex queries (JOIN, subqueries, aggregations, window functions)

### 3. SQL Validator
- **Syntax validation**: Checks SQL grammar correctness
- **Semantic validation**: Verifies table/column existence and type compatibility
- **Security validation**: SQL injection detection, dangerous keyword blocking
- **Performance analysis**: Cost estimation, index usage, optimization suggestions
- **Auto-correction**: Uses error case library to fix common mistakes

### 4. Vector Knowledge Base

#### Schema Embedding Store
- Table and column embeddings for semantic search
- Sample values and comments for better matching

#### Query-SQL Example Store
- High-quality query→SQL pairs
- Categorized by business domain
- Used for Few-shot learning

#### Error Case Store (Core Innovation)
- Failed queries with corrections
- Error type classification
- Automatic learning from failures
- Similarity-based error resolution

#### Business Rule Store
- Field mapping rules (aliases → standard names)
- Business logic templates
- Permission rules

### 5. Dialog Manager
- Multi-turn conversation tracking
- Slot filling for incomplete queries
- Reference resolution ("them", "those", etc.)
- Context-aware query interpretation

### 6. NLU Module
- Intent recognition (query, aggregation, comparison, trend analysis)
- Entity extraction (dates, numbers, business entities, operators)
- Semantic parsing to intermediate representation

### 7. Data Access Layer
- **Row-level security**: Tenant isolation, custom filters
- **Column-level security**: Sensitive field masking (phone, email, ID card, etc.)
- **Query caching**: Redis or in-memory cache
- **Result formatting**: Markdown table output

## Usage

### Basic Example

\`\`\`typescript
import { Text2SQLOrchestrator } from '@/server/modules/text2sql';
import { createVectorStore } from '@/server/modules/text2sql/vector-store';

// 1. Create configuration
const config = {
  vectorStore: {
    provider: 'milvus',
    host: 'localhost',
    port: 19530,
    collections: {
      schema: 'text2sql_schema',
      examples: 'text2sql_examples',
      errors: 'text2sql_errors',
    },
  },
  embedding: {
    model: 'text-embedding-ada-002',
    dimension: 1536,
    provider: 'openai',
  },
  llm: {
    provider: 'openai',
    model: 'gpt-4-turbo',
    temperature: 0.1,
    maxTokens: 1000,
  },
  database: {
    type: 'doris',
    host: 'localhost',
    port: 9030,
    database: 'crm',
    username: 'root',
    password: 'password',
  },
  cache: {
    enabled: true,
    ttl: 300,
    provider: 'redis',
  },
  security: {
    enableSQLInjectionDetection: true,
    enableRowLevelSecurity: true,
    sensitiveFieldMasking: true,
  },
};

// 2. Initialize vector store
const vectorStore = createVectorStore(config);

// 3. Initialize LLM provider (implement based on your LLM service)
const llmProvider = {
  generate: async (prompt: string) => {
    // Call your LLM API here
    return 'SELECT * FROM customers WHERE ...';
  },
};

// 4. Initialize database connection (implement based on your DB)
const dbConnection = {
  query: async (sql: string) => {
    // Execute query on your database
    return [];
  },
  close: async () => {},
};

// 5. Create orchestrator
const orchestrator = new Text2SQLOrchestrator(
  config,
  vectorStore,
  llmProvider,
  dbConnection,
);

// 6. Load database schemas
await orchestrator.tableSelector.loadSchemas([
  {
    name: 'customers',
    comment: '客户信息表',
    columns: [
      { name: 'id', type: 'INT', nullable: false },
      { name: 'name', type: 'VARCHAR(100)', nullable: false, comment: '客户姓名' },
      { name: 'phone', type: 'VARCHAR(20)', nullable: true, comment: '手机号' },
      { name: 'email', type: 'VARCHAR(100)', nullable: true, comment: '邮箱' },
      { name: 'created_at', type: 'DATETIME', nullable: false, comment: '创建时间' },
    ],
    primaryKeys: ['id'],
  },
  // ... more tables
]);

// 7. Process user query
const result = await orchestrator.processQuery({
  query: '查询上个月消费超过1万元的客户',
  userId: 'user123',
  sessionId: 'session456',
});

console.log(result.result.formattedOutput);
console.log('Execution time:', result.metadata.executionTime, 'ms');
console.log('SQL:', result.metadata.sql);
\`\`\`

### Multi-turn Conversation

\`\`\`typescript
// First query
const result1 = await orchestrator.processQuery({
  query: '查询上个月的订单',
  userId: 'user123',
  sessionId: 'session456',
});

// Follow-up query (references "上个月的订单" from context)
const result2 = await orchestrator.processQuery({
  query: '那这些订单的平均金额是多少？',
  userId: 'user123',
  sessionId: 'session456',
});
\`\`\`

## Configuration

### Environment Variables

\`\`\`env
# Vector Database
TEXT2SQL_VECTOR_PROVIDER=milvus
TEXT2SQL_VECTOR_HOST=localhost
TEXT2SQL_VECTOR_PORT=19530
TEXT2SQL_VECTOR_API_KEY=your_api_key

# Embedding Model
TEXT2SQL_EMBEDDING_PROVIDER=openai
TEXT2SQL_EMBEDDING_MODEL=text-embedding-ada-002
TEXT2SQL_EMBEDDING_DIMENSION=1536

# LLM
TEXT2SQL_LLM_PROVIDER=openai
TEXT2SQL_LLM_MODEL=gpt-4-turbo
TEXT2SQL_LLM_TEMPERATURE=0.1
TEXT2SQL_LLM_MAX_TOKENS=1000

# Database
TEXT2SQL_DB_TYPE=doris
TEXT2SQL_DB_HOST=localhost
TEXT2SQL_DB_PORT=9030
TEXT2SQL_DB_NAME=crm
TEXT2SQL_DB_USER=root
TEXT2SQL_DB_PASSWORD=password

# Cache
TEXT2SQL_CACHE_ENABLED=true
TEXT2SQL_CACHE_TTL=300
TEXT2SQL_CACHE_PROVIDER=redis
TEXT2SQL_REDIS_HOST=localhost
TEXT2SQL_REDIS_PORT=6379

# Security
TEXT2SQL_ENABLE_SQL_INJECTION_DETECTION=true
TEXT2SQL_ENABLE_ROW_LEVEL_SECURITY=true
TEXT2SQL_ENABLE_FIELD_MASKING=true
\`\`\`

## Feedback Loop

The system continuously learns from both successes and failures:

1. **Success Recording**: High-confidence queries are automatically added to the example library
2. **Error Recording**: Failed queries are saved to the error case library for manual review
3. **Manual Review**: Admins can review and correct error cases
4. **Auto-correction**: Future similar errors are automatically corrected using the error library

## Performance Optimization

1. **Schema Embedding Pre-loading**: Embeddings are generated once and cached
2. **Query Result Caching**: Frequently accessed queries are cached in Redis
3. **Example Library Sharding**: Query examples are organized by business category
4. **Batch Processing**: Multiple embeddings can be generated in parallel

## Security Features

1. **SQL Injection Prevention**: Pattern detection and keyword blocking
2. **Row-Level Security**: Automatic tenant isolation and custom filters
3. **Column-Level Security**: Sensitive field masking (phone, email, ID card, bank account)
4. **Permission Validation**: Table and column access control

## Best Practices

1. **Schema Documentation**: Add meaningful comments to tables and columns
2. **Example Curation**: Maintain high-quality query→SQL examples
3. **Error Review**: Regularly review and correct error cases
4. **Performance Monitoring**: Track query execution time and optimize slow queries
5. **Security Auditing**: Log all queries and access patterns

## Extensibility

### Adding New Vector Store Provider

\`\`\`typescript
import { BaseVectorStore } from './vector-store';

class CustomVectorStore extends BaseVectorStore {
  async addSchemaEmbedding(embedding: SchemaEmbedding): Promise<void> {
    // Implement using your vector DB
  }
  // ... implement other methods
}
\`\`\`

### Adding Custom Validators

\`\`\`typescript
class CustomSQLValidator extends SQLValidator {
  protected validateCustomRules(sql: string): ValidationError[] {
    // Add your custom validation logic
  }
}
\`\`\`

## License

MIT

## Support

For issues and questions, please open a GitHub issue or contact the maintainers.
