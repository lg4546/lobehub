/**
 * Dialog Manager Module
 * Manages conversation context, multi-turn dialogue, and slot filling
 */

import type { ConversationContext, ConversationTurn, Entity } from '@/types/text2sql';

export class DialogManager {
  private contexts: Map<string, ConversationContext> = new Map();

  /**
   * Get or create conversation context
   */
  getContext(sessionId: string, userId: string): ConversationContext {
    let context = this.contexts.get(sessionId);

    if (!context) {
      context = {
        sessionId,
        userId,
        history: [],
        slots: {},
      };
      this.contexts.set(sessionId, context);
    }

    return context;
  }

  /**
   * Update conversation context with new turn
   */
  addTurn(
    sessionId: string,
    userMessage: string,
    assistantMessage?: string,
    sql?: string,
    results?: any,
  ): void {
    const context = this.contexts.get(sessionId);
    if (!context) {
      throw new Error(`Context not found for session: ${sessionId}`);
    }

    context.history.push({
      userMessage,
      assistantMessage,
      sql,
      results,
      timestamp: new Date(),
    });

    // Keep only last 10 turns to manage memory
    if (context.history.length > 10) {
      context.history = context.history.slice(-10);
    }
  }

  /**
   * Update intent for current context
   */
  updateIntent(sessionId: string, intent: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.intent = intent;
    }
  }

  /**
   * Update entities for current context
   */
  updateEntities(sessionId: string, entities: Entity[]): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.entities = entities;
    }
  }

  /**
   * Fill slot with value
   */
  fillSlot(sessionId: string, slotName: string, value: any): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.slots[slotName] = value;
    }
  }

  /**
   * Get slot value
   */
  getSlot(sessionId: string, slotName: string): any {
    const context = this.contexts.get(sessionId);
    return context?.slots[slotName];
  }

  /**
   * Check if all required slots are filled
   */
  areSlotsComplete(sessionId: string, requiredSlots: string[]): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    return requiredSlots.every((slot) => context.slots[slot] !== undefined);
  }

  /**
   * Get missing slots
   */
  getMissingSlots(sessionId: string, requiredSlots: string[]): string[] {
    const context = this.contexts.get(sessionId);
    if (!context) return requiredSlots;

    return requiredSlots.filter((slot) => context.slots[slot] === undefined);
  }

  /**
   * Clear specific slot
   */
  clearSlot(sessionId: string, slotName: string): void {
    const context = this.contexts.get(sessionId);
    if (context && context.slots[slotName] !== undefined) {
      delete context.slots[slotName];
    }
  }

  /**
   * Clear all slots
   */
  clearAllSlots(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.slots = {};
    }
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId: string, limit?: number): ConversationTurn[] {
    const context = this.contexts.get(sessionId);
    if (!context) return [];

    const history = context.history;
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get last turn
   */
  getLastTurn(sessionId: string): ConversationTurn | undefined {
    const context = this.contexts.get(sessionId);
    return context?.history[context.history.length - 1];
  }

  /**
   * Check if this is a follow-up query
   */
  isFollowUpQuery(sessionId: string, query: string): boolean {
    const context = this.contexts.get(sessionId);
    if (!context || context.history.length === 0) return false;

    const lowerQuery = query.toLowerCase();

    // Patterns indicating follow-up
    const followUpPatterns = [
      /^(那|然后|接着|还有|另外|再)/,
      /^(and|also|moreover|furthermore|additionally)/i,
      /^(what about|how about)/i,
      /^(那么|那|then)/,
    ];

    // Check for pronouns
    const pronouns = ['他们', '它们', '这些', '那些', 'they', 'them', 'these', 'those', 'this', 'that'];

    return (
      followUpPatterns.some((pattern) => pattern.test(lowerQuery)) ||
      pronouns.some((pronoun) => lowerQuery.includes(pronoun))
    );
  }

  /**
   * Resolve references in follow-up query
   */
  resolveReferences(sessionId: string, query: string): string {
    const context = this.contexts.get(sessionId);
    if (!context || context.history.length === 0) return query;

    const lastTurn = context.history[context.history.length - 1];
    let resolvedQuery = query;

    // Replace pronouns with entities from last turn
    if (context.entities && context.entities.length > 0) {
      const pronounReplacements: Record<string, string> = {
        '他们': context.entities[0].value as string,
        '它们': context.entities[0].value as string,
        '这些': context.entities[0].value as string,
        '那些': context.entities[0].value as string,
        they: context.entities[0].value as string,
        them: context.entities[0].value as string,
        these: context.entities[0].value as string,
        those: context.entities[0].value as string,
      };

      for (const [pronoun, replacement] of Object.entries(pronounReplacements)) {
        const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
        resolvedQuery = resolvedQuery.replace(regex, replacement);
      }
    }

    // If query is very short and seems incomplete, combine with context
    if (resolvedQuery.length < 10 && lastTurn.userMessage) {
      // Extract key information from last query
      const contextInfo = this.extractKeyInfo(lastTurn.userMessage);
      if (contextInfo) {
        resolvedQuery = `${contextInfo} ${resolvedQuery}`;
      }
    }

    return resolvedQuery;
  }

  /**
   * Extract key information from query
   */
  private extractKeyInfo(query: string): string | null {
    // Extract business entities and time references
    const entities = query.match(
      /(客户|订单|产品|储值卡|会员|权益|customer|order|product|card|member)/gi,
    );
    const timeRefs = query.match(/(昨天|今天|上周|上月|去年|yesterday|today|last\s+\w+)/gi);

    const parts: string[] = [];
    if (entities) parts.push(entities[0]);
    if (timeRefs) parts.push(timeRefs[0]);

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Clear context (e.g., when user starts new conversation)
   */
  clearContext(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Clean up old sessions (older than specified hours)
   */
  cleanupOldSessions(maxAgeHours: number = 24): number {
    const now = new Date();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    let cleaned = 0;

    for (const [sessionId, context] of this.contexts.entries()) {
      if (context.history.length === 0) {
        this.contexts.delete(sessionId);
        cleaned++;
        continue;
      }

      const lastTurn = context.history[context.history.length - 1];
      const age = now.getTime() - lastTurn.timestamp.getTime();

      if (age > maxAge) {
        this.contexts.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Export context for persistence
   */
  exportContext(sessionId: string): ConversationContext | null {
    return this.contexts.get(sessionId) || null;
  }

  /**
   * Import context from persistence
   */
  importContext(context: ConversationContext): void {
    this.contexts.set(context.sessionId, context);
  }
}
