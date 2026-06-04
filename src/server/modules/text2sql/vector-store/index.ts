/**
 * Vector Store Service
 * Manages vector embeddings for schema, examples, and error cases
 */

import type {
  BusinessRule,
  ErrorCase,
  QuerySQLExample,
  SchemaEmbedding,
  Text2SQLConfig,
} from '@/types/text2sql';

export interface VectorStoreService {
  // Schema Embedding operations
  addSchemaEmbedding(embedding: SchemaEmbedding): Promise<void>;
  searchSchemaEmbeddings(queryEmbedding: number[], topK: number): Promise<SchemaEmbedding[]>;
  updateSchemaEmbedding(id: string, embedding: SchemaEmbedding): Promise<void>;
  deleteSchemaEmbedding(id: string): Promise<void>;

  // Query-SQL Example operations
  addQueryExample(example: QuerySQLExample): Promise<void>;
  searchQueryExamples(
    queryEmbedding: number[],
    topK: number,
    category?: string,
  ): Promise<QuerySQLExample[]>;
  updateQueryExample(id: string, example: QuerySQLExample): Promise<void>;
  deleteQueryExample(id: string): Promise<void>;

  // Error Case operations
  addErrorCase(errorCase: ErrorCase): Promise<void>;
  searchErrorCases(queryEmbedding: number[], topK: number): Promise<ErrorCase[]>;
  updateErrorCase(id: string, errorCase: ErrorCase): Promise<void>;
  markErrorCaseReviewed(id: string): Promise<void>;

  // Business Rule operations
  addBusinessRule(rule: BusinessRule): Promise<void>;
  getBusinessRules(type?: string): Promise<BusinessRule[]>;
  updateBusinessRule(id: string, rule: BusinessRule): Promise<void>;

  // Utility operations
  generateEmbedding(text: string): Promise<number[]>;
  cosineSimilarity(vec1: number[], vec2: number[]): number;
}

/**
 * Base Vector Store Implementation
 * This is an abstract base class that can be extended for different vector DB providers
 */
export abstract class BaseVectorStore implements VectorStoreService {
  protected config: Text2SQLConfig;

  constructor(config: Text2SQLConfig) {
    this.config = config;
  }

  // Abstract methods that must be implemented by specific providers
  abstract addSchemaEmbedding(embedding: SchemaEmbedding): Promise<void>;
  abstract searchSchemaEmbeddings(queryEmbedding: number[], topK: number): Promise<SchemaEmbedding[]>;
  abstract updateSchemaEmbedding(id: string, embedding: SchemaEmbedding): Promise<void>;
  abstract deleteSchemaEmbedding(id: string): Promise<void>;

  abstract addQueryExample(example: QuerySQLExample): Promise<void>;
  abstract searchQueryExamples(
    queryEmbedding: number[],
    topK: number,
    category?: string,
  ): Promise<QuerySQLExample[]>;
  abstract updateQueryExample(id: string, example: QuerySQLExample): Promise<void>;
  abstract deleteQueryExample(id: string): Promise<void>;

  abstract addErrorCase(errorCase: ErrorCase): Promise<void>;
  abstract searchErrorCases(queryEmbedding: number[], topK: number): Promise<ErrorCase[]>;
  abstract updateErrorCase(id: string, errorCase: ErrorCase): Promise<void>;
  abstract markErrorCaseReviewed(id: string): Promise<void>;

  abstract addBusinessRule(rule: BusinessRule): Promise<void>;
  abstract getBusinessRules(type?: string): Promise<BusinessRule[]>;
  abstract updateBusinessRule(id: string, rule: BusinessRule): Promise<void>;

  /**
   * Generate embedding vector for text
   * This uses the configured embedding model
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // This would integrate with your embedding service
    // For now, returning a placeholder
    throw new Error('generateEmbedding must be implemented with actual embedding service');
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}

/**
 * In-Memory Vector Store Implementation
 * For development and testing purposes
 */
export class InMemoryVectorStore extends BaseVectorStore {
  private schemaEmbeddings: Map<string, SchemaEmbedding> = new Map();
  private queryExamples: Map<string, QuerySQLExample> = new Map();
  private errorCases: Map<string, ErrorCase> = new Map();
  private businessRules: Map<string, BusinessRule> = new Map();

  async addSchemaEmbedding(embedding: SchemaEmbedding): Promise<void> {
    this.schemaEmbeddings.set(embedding.id, embedding);
  }

  async searchSchemaEmbeddings(
    queryEmbedding: number[],
    topK: number,
  ): Promise<SchemaEmbedding[]> {
    const results = Array.from(this.schemaEmbeddings.values()).map((embedding) => ({
      embedding,
      score: this.cosineSimilarity(queryEmbedding, embedding.embedding),
    }));

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => r.embedding);
  }

  async updateSchemaEmbedding(id: string, embedding: SchemaEmbedding): Promise<void> {
    this.schemaEmbeddings.set(id, embedding);
  }

  async deleteSchemaEmbedding(id: string): Promise<void> {
    this.schemaEmbeddings.delete(id);
  }

  async addQueryExample(example: QuerySQLExample): Promise<void> {
    this.queryExamples.set(example.id, example);
  }

  async searchQueryExamples(
    queryEmbedding: number[],
    topK: number,
    category?: string,
  ): Promise<QuerySQLExample[]> {
    let examples = Array.from(this.queryExamples.values());

    if (category) {
      examples = examples.filter((ex) => ex.category === category);
    }

    const results = examples.map((example) => ({
      example,
      score: this.cosineSimilarity(queryEmbedding, example.embedding),
    }));

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => r.example);
  }

  async updateQueryExample(id: string, example: QuerySQLExample): Promise<void> {
    this.queryExamples.set(id, example);
  }

  async deleteQueryExample(id: string): Promise<void> {
    this.queryExamples.delete(id);
  }

  async addErrorCase(errorCase: ErrorCase): Promise<void> {
    this.errorCases.set(errorCase.id, errorCase);
  }

  async searchErrorCases(queryEmbedding: number[], topK: number): Promise<ErrorCase[]> {
    const results = Array.from(this.errorCases.values()).map((errorCase) => ({
      errorCase,
      score: this.cosineSimilarity(queryEmbedding, errorCase.embedding),
    }));

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => r.errorCase);
  }

  async updateErrorCase(id: string, errorCase: ErrorCase): Promise<void> {
    this.errorCases.set(id, errorCase);
  }

  async markErrorCaseReviewed(id: string): Promise<void> {
    const errorCase = this.errorCases.get(id);
    if (errorCase) {
      errorCase.reviewed = true;
      this.errorCases.set(id, errorCase);
    }
  }

  async addBusinessRule(rule: BusinessRule): Promise<void> {
    this.businessRules.set(rule.id, rule);
  }

  async getBusinessRules(type?: string): Promise<BusinessRule[]> {
    let rules = Array.from(this.businessRules.values());
    if (type) {
      rules = rules.filter((rule) => rule.type === type);
    }
    return rules.filter((rule) => rule.active);
  }

  async updateBusinessRule(id: string, rule: BusinessRule): Promise<void> {
    this.businessRules.set(id, rule);
  }
}

/**
 * Factory function to create vector store based on configuration
 */
export function createVectorStore(config: Text2SQLConfig): VectorStoreService {
  switch (config.vectorStore.provider) {
    case 'milvus':
      // return new MilvusVectorStore(config);
      throw new Error('Milvus provider not yet implemented');
    case 'qdrant':
      // return new QdrantVectorStore(config);
      throw new Error('Qdrant provider not yet implemented');
    case 'weaviate':
      // return new WeaviateVectorStore(config);
      throw new Error('Weaviate provider not yet implemented');
    default:
      return new InMemoryVectorStore(config);
  }
}
