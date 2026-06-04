/**
 * NLU (Natural Language Understanding) Module
 * Handles intent recognition, entity extraction, and semantic parsing
 */

import type { Condition, Entity, Intent, NLUInput, NLUOutput, SemanticParse } from '@/types/text2sql';

export class NLUModule {
  /**
   * Process natural language query
   */
  async process(input: NLUInput): Promise<NLUOutput> {
    const { query, context } = input;

    // Recognize intent
    const intent = this.recognizeIntent(query);

    // Extract entities
    const entities = this.extractEntities(query);

    // Parse semantic structure
    const semanticParse = this.parseSemantics(query, intent, entities);

    return {
      intent,
      entities,
      semanticParse,
    };
  }

  /**
   * Recognize user intent
   */
  private recognizeIntent(query: string): Intent {
    const lowerQuery = query.toLowerCase();

    // Query patterns
    if (
      lowerQuery.includes('查询') ||
      lowerQuery.includes('显示') ||
      lowerQuery.includes('列出') ||
      lowerQuery.includes('查看') ||
      lowerQuery.includes('找') ||
      lowerQuery.includes('show') ||
      lowerQuery.includes('list') ||
      lowerQuery.includes('find')
    ) {
      return {
        name: 'query',
        confidence: 0.9,
        category: 'query',
      };
    }

    // Aggregation patterns
    if (
      lowerQuery.includes('统计') ||
      lowerQuery.includes('汇总') ||
      lowerQuery.includes('总共') ||
      lowerQuery.includes('总数') ||
      lowerQuery.includes('平均') ||
      lowerQuery.includes('最大') ||
      lowerQuery.includes('最小') ||
      lowerQuery.includes('count') ||
      lowerQuery.includes('sum') ||
      lowerQuery.includes('average') ||
      lowerQuery.includes('total')
    ) {
      return {
        name: 'aggregation',
        confidence: 0.9,
        category: 'aggregation',
      };
    }

    // Comparison patterns
    if (
      lowerQuery.includes('比较') ||
      lowerQuery.includes('对比') ||
      lowerQuery.includes('compare') ||
      lowerQuery.includes('versus') ||
      lowerQuery.includes('vs')
    ) {
      return {
        name: 'comparison',
        confidence: 0.85,
        category: 'comparison',
      };
    }

    // Trend analysis patterns
    if (
      lowerQuery.includes('趋势') ||
      lowerQuery.includes('变化') ||
      lowerQuery.includes('增长') ||
      lowerQuery.includes('trend') ||
      lowerQuery.includes('growth') ||
      lowerQuery.includes('change')
    ) {
      return {
        name: 'trend_analysis',
        confidence: 0.85,
        category: 'trend_analysis',
      };
    }

    // Default to query
    return {
      name: 'query',
      confidence: 0.5,
      category: 'query',
    };
  }

  /**
   * Extract entities from query
   */
  private extractEntities(query: string): Entity[] {
    const entities: Entity[] = [];

    // Extract dates
    const datePatterns = [
      { pattern: /昨天|yesterday/i, value: 'yesterday' },
      { pattern: /今天|today/i, value: 'today' },
      { pattern: /上周|last\s*week/i, value: 'last_week' },
      { pattern: /上个?月|last\s*month/i, value: 'last_month' },
      { pattern: /今年|this\s*year/i, value: 'this_year' },
      { pattern: /去年|last\s*year/i, value: 'last_year' },
      { pattern: /最近(\d+)天/i, value: 'recent_days' },
      { pattern: /(\d{4})-(\d{1,2})-(\d{1,2})/i, value: 'date' },
    ];

    for (const { pattern, value } of datePatterns) {
      const match = query.match(pattern);
      if (match) {
        entities.push({
          type: 'date',
          value: value === 'recent_days' && match[1] ? `${match[1]}_days` : value,
          confidence: 0.9,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    // Extract numbers
    const numberPattern = /([一二三四五六七八九十百千万亿\d]+)\s*(个|人|次|单|笔|元|万元)?/g;
    let numberMatch;
    // eslint-disable-next-line no-cond-assign
    while ((numberMatch = numberPattern.exec(query)) !== null) {
      const numStr = numberMatch[1];
      const value = this.parseChineseNumber(numStr);
      if (value !== null) {
        entities.push({
          type: 'number',
          value,
          confidence: 0.9,
          position: { start: numberMatch.index, end: numberMatch.index + numberMatch[0].length },
        });
      }
    }

    // Extract comparison operators
    const comparisonPatterns = [
      { pattern: /大于|超过|多于|more\s*than|greater\s*than|>/i, value: '>' },
      { pattern: /小于|少于|低于|less\s*than|</i, value: '<' },
      { pattern: /等于|是|为|equals?|is/i, value: '=' },
      { pattern: /不等于|不是|不为|not\s*equals?/i, value: '!=' },
    ];

    for (const { pattern, value } of comparisonPatterns) {
      const match = query.match(pattern);
      if (match) {
        entities.push({
          type: 'operator',
          value,
          confidence: 0.85,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    // Extract business entities
    const businessPatterns = [
      { pattern: /客户|顾客|用户|customer|user/i, value: 'customer' },
      { pattern: /订单|order/i, value: 'order' },
      { pattern: /产品|商品|product/i, value: 'product' },
      { pattern: /储值卡|卡|card/i, value: 'card' },
      { pattern: /会员|member/i, value: 'member' },
      { pattern: /权益|benefit/i, value: 'benefit' },
    ];

    for (const { pattern, value } of businessPatterns) {
      const match = query.match(pattern);
      if (match) {
        entities.push({
          type: 'business_entity',
          value,
          confidence: 0.9,
          position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        });
      }
    }

    return entities;
  }

  /**
   * Parse semantic structure
   */
  private parseSemantics(query: string, intent: Intent, entities: Entity[]): SemanticParse {
    const lowerQuery = query.toLowerCase();

    // Determine action based on intent and keywords
    let action = 'select';
    if (
      intent.category === 'aggregation' ||
      lowerQuery.includes('统计') ||
      lowerQuery.includes('count')
    ) {
      action = 'count';
    }
    if (lowerQuery.includes('总') || lowerQuery.includes('sum')) {
      action = 'sum';
    }
    if (lowerQuery.includes('平均') || lowerQuery.includes('average') || lowerQuery.includes('avg')) {
      action = 'average';
    }

    // Extract target entities
    const businessEntities = entities.filter((e) => e.type === 'business_entity');
    const target = businessEntities.map((e) => String(e.value));

    // Build conditions from entities
    const conditions: Condition[] = [];

    // Date conditions
    const dateEntities = entities.filter((e) => e.type === 'date');
    const operatorEntities = entities.filter((e) => e.type === 'operator');
    const numberEntities = entities.filter((e) => e.type === 'number');

    for (const dateEntity of dateEntities) {
      conditions.push({
        field: 'date',
        operator: '>=',
        value: this.convertDateValue(String(dateEntity.value)),
      });
    }

    // Number conditions (e.g., "大于1万")
    if (operatorEntities.length > 0 && numberEntities.length > 0) {
      const operator = operatorEntities[0].value;
      const number = numberEntities[0].value;
      conditions.push({
        field: 'amount',
        operator: String(operator),
        value: number,
      });
    }

    // Detect GROUP BY
    const groupBy: string[] = [];
    if (lowerQuery.includes('按') || lowerQuery.includes('分组') || lowerQuery.includes('group')) {
      // Would need more sophisticated parsing here
    }

    // Detect ORDER BY
    const orderBy: SemanticParse['orderBy'] = [];
    if (lowerQuery.includes('排序') || lowerQuery.includes('order')) {
      const direction = lowerQuery.includes('降序') || lowerQuery.includes('desc') ? 'desc' : 'asc';
      orderBy.push({ field: 'amount', direction });
    }

    // Detect LIMIT
    let limit: number | undefined;
    const limitMatch = query.match(/前(\d+)|top\s*(\d+)|limit\s*(\d+)/i);
    if (limitMatch) {
      limit = Number.parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3], 10);
    }

    return {
      action,
      target,
      conditions,
      groupBy: groupBy.length > 0 ? groupBy : undefined,
      orderBy: orderBy.length > 0 ? orderBy : undefined,
      limit,
    };
  }

  /**
   * Parse Chinese number to numeric value
   */
  private parseChineseNumber(str: string): number | null {
    // First try to parse as regular number
    const num = Number.parseFloat(str);
    if (!Number.isNaN(num)) {
      return num;
    }

    // Chinese number mapping
    const digitMap: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      百: 100,
      千: 1000,
      万: 10000,
      亿: 100000000,
    };

    // Simplified Chinese number parsing
    let result = 0;
    let temp = 0;
    let unit = 1;

    for (const char of str) {
      if (char in digitMap) {
        const value = digitMap[char];
        if (value >= 10) {
          if (temp === 0) temp = 1;
          unit = value;
          result += temp * unit;
          temp = 0;
          unit = 1;
        } else {
          temp = value;
        }
      }
    }

    result += temp;
    return result > 0 ? result : null;
  }

  /**
   * Convert date value to SQL date expression
   */
  private convertDateValue(value: string): string {
    const conversions: Record<string, string> = {
      yesterday: "DATE_SUB(CURDATE(), INTERVAL 1 DAY)",
      today: 'CURDATE()',
      last_week: "DATE_SUB(CURDATE(), INTERVAL 1 WEEK)",
      last_month: "DATE_SUB(CURDATE(), INTERVAL 1 MONTH)",
      this_year: "DATE_FORMAT(CURDATE(), '%Y-01-01')",
      last_year: "DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-01-01'), INTERVAL 1 YEAR)",
    };

    // Handle recent_days pattern
    const daysMatch = value.match(/(\d+)_days/);
    if (daysMatch) {
      return `DATE_SUB(CURDATE(), INTERVAL ${daysMatch[1]} DAY)`;
    }

    return conversions[value] || `'${value}'`;
  }
}
