/**
 * Text2SQL System Integration Tests
 */

import { describe, expect, it, vi } from 'vitest';

import type { TableSchema } from '@/types/text2sql';

import { InMemoryCacheProvider } from '../data-access';
import { DialogManager } from '../dialog-manager';
import type { LLMProvider } from '../dsl-generator';
import { NLUModule } from '../nlu';
import { SQLValidator } from '../sql-validator';
import { TableSelector } from '../table-selector';
import { InMemoryVectorStore } from '../vector-store';

describe('Text2SQL System', () => {
  const mockConfig = {
    vectorStore: {
      provider: 'milvus' as const,
      host: 'localhost',
      port: 19530,
      collections: {
        schema: 'test_schema',
        examples: 'test_examples',
        errors: 'test_errors',
      },
    },
    embedding: {
      model: 'test-model',
      dimension: 768,
      provider: 'test',
    },
    llm: {
      provider: 'test',
      model: 'test-model',
      temperature: 0.1,
      maxTokens: 1000,
    },
    database: {
      type: 'doris' as const,
      host: 'localhost',
      port: 9030,
      database: 'test',
      username: 'root',
      password: 'password',
    },
    cache: {
      enabled: true,
      ttl: 300,
      provider: 'memory' as const,
    },
    security: {
      enableSQLInjectionDetection: true,
      enableRowLevelSecurity: true,
      sensitiveFieldMasking: true,
    },
  };

  const testSchemas: TableSchema[] = [
    {
      name: 'customers',
      comment: '客户表',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'name', type: 'VARCHAR(100)', nullable: false },
        { name: 'phone', type: 'VARCHAR(20)', nullable: true },
      ],
      primaryKeys: ['id'],
    },
  ];

  describe('VectorStore', () => {
    it('should store and search schema embeddings', async () => {
      const vectorStore = new InMemoryVectorStore(mockConfig);

      await vectorStore.addSchemaEmbedding({
        id: 'test1',
        tableName: 'customers',
        text: 'customers table',
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: 'table' },
      });

      const results = await vectorStore.searchSchemaEmbeddings([0.1, 0.2, 0.3], 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test1');
    });

    it('should calculate cosine similarity correctly', () => {
      const vectorStore = new InMemoryVectorStore(mockConfig);
      const similarity = vectorStore.cosineSimilarity([1, 0, 0], [1, 0, 0]);
      expect(similarity).toBe(1);
    });
  });

  describe('NLU Module', () => {
    it('should recognize query intent', async () => {
      const nlu = new NLUModule();
      const result = await nlu.process({ query: '查询所有客户' });

      expect(result.intent.category).toBe('query');
      expect(result.intent.confidence).toBeGreaterThan(0);
    });

    it('should recognize aggregation intent', async () => {
      const nlu = new NLUModule();
      const result = await nlu.process({ query: '统计订单总数' });

      expect(result.intent.category).toBe('aggregation');
    });

    it('should extract entities', async () => {
      const nlu = new NLUModule();
      const result = await nlu.process({ query: '查询上个月的客户' });

      expect(result.entities.length).toBeGreaterThan(0);
      const dateEntity = result.entities.find((e) => e.type === 'date');
      expect(dateEntity).toBeDefined();
    });
  });

  describe('SQL Validator', () => {
    it('should validate correct SQL', async () => {
      const vectorStore = new InMemoryVectorStore(mockConfig);
      const validator = new SQLValidator(vectorStore);
      validator.loadSchemas(testSchemas);

      const result = await validator.validate({
        sql: 'SELECT * FROM customers',
        query: 'test',
        schema: testSchemas,
      });

      expect(result.valid).toBe(true);
    });

    it('should detect syntax errors', async () => {
      const vectorStore = new InMemoryVectorStore(mockConfig);
      const validator = new SQLValidator(vectorStore);

      const result = await validator.validate({
        sql: 'SELECT * FROM',
        query: 'test',
        schema: testSchemas,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should detect SQL injection', async () => {
      const vectorStore = new InMemoryVectorStore(mockConfig);
      const validator = new SQLValidator(vectorStore);

      const result = await validator.validate({
        sql: "SELECT * FROM customers WHERE id = 1; DROP TABLE customers;",
        query: 'test',
        schema: testSchemas,
      });

      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.type === 'security')).toBe(true);
    });
  });

  describe('Dialog Manager', () => {
    it('should create and manage conversation context', () => {
      const dialogManager = new DialogManager();
      const context = dialogManager.getContext('session1', 'user1');

      expect(context.sessionId).toBe('session1');
      expect(context.userId).toBe('user1');
      expect(context.history).toHaveLength(0);
    });

    it('should add conversation turns', () => {
      const dialogManager = new DialogManager();
      dialogManager.getContext('session1', 'user1');
      dialogManager.addTurn('session1', 'Hello', 'Hi there');

      const history = dialogManager.getHistory('session1');
      expect(history).toHaveLength(1);
      expect(history[0].userMessage).toBe('Hello');
    });

    it('should detect follow-up queries', () => {
      const dialogManager = new DialogManager();
      dialogManager.getContext('session1', 'user1');
      dialogManager.addTurn('session1', '查询客户', 'Here are the customers');

      const isFollowUp = dialogManager.isFollowUpQuery('session1', '那他们的订单呢？');
      expect(isFollowUp).toBe(true);
    });

    it('should fill and get slots', () => {
      const dialogManager = new DialogManager();
      dialogManager.getContext('session1', 'user1');

      dialogManager.fillSlot('session1', 'date', '2024-01-01');
      const value = dialogManager.getSlot('session1', 'date');

      expect(value).toBe('2024-01-01');
    });
  });

  describe('Cache Provider', () => {
    it('should store and retrieve values', async () => {
      const cache = new InMemoryCacheProvider();

      await cache.set('key1', { data: 'value1' }, 300);
      const value = await cache.get('key1');

      expect(value).toEqual({ data: 'value1' });
    });

    it('should expire values after TTL', async () => {
      const cache = new InMemoryCacheProvider();

      await cache.set('key2', { data: 'value2' }, 0.1); // 0.1 seconds
      await new Promise((resolve) => setTimeout(resolve, 150)); // Wait 150ms

      const value = await cache.get('key2');
      expect(value).toBeNull();
    });
  });

  describe('Table Selector', () => {
    it('should select relevant tables', async () => {
      const vectorStore = new InMemoryVectorStore(mockConfig);
      const tableSelector = new TableSelector(vectorStore);

      // Mock generateEmbedding
      vi.spyOn(vectorStore, 'generateEmbedding').mockResolvedValue([0.1, 0.2, 0.3]);

      await tableSelector.loadSchemas(testSchemas);

      const result = await tableSelector.selectTables({
        query: '查询客户',
        topK: 3,
      });

      expect(result.tables.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('DSL Generator', () => {
    it('should generate SQL from query', async () => {
      const vectorStore = new InMemoryVectorStore(mockConfig);
      const mockLLM: LLMProvider = {
        generate: vi.fn().mockResolvedValue(
          JSON.stringify({
            sql: 'SELECT * FROM customers',
            confidence: 0.9,
            explanation: 'Query all customers',
          }),
        ),
      };

      const dslGenerator = await import('../dsl-generator').then((m) => new m.DSLGenerator(vectorStore, mockLLM));

      // Mock generateEmbedding
      vi.spyOn(vectorStore, 'generateEmbedding').mockResolvedValue([0.1, 0.2, 0.3]);

      const result = await dslGenerator.generateSQL({
        query: '查询所有客户',
        selectedTables: [
          {
            name: 'customers',
            schema: testSchemas[0],
            relevanceScore: 0.9,
            matchedColumns: ['name'],
          },
        ],
      });

      expect(result.sql).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
