import { GeminiService } from '../src/services/models/gemini';

// Mock the Gemini API client
jest.mock('@google/generative-ai', () => ({
  GeminiClient: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'This is a mock response from Gemini' }],
        model: 'gemini-lite',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 8,
          output_tokens: 12,
        },
      }),
      stream: jest.fn(),
    },
  })),
}));

// Mock the logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logApiCall: jest.fn(),
    getLogs: jest.fn(),
    clearLogs: jest.fn(),
  },
  Logger: {
    getInstance: jest.fn(),
  },
}));

describe('GeminiService', () => {
  let geminiService: GeminiService;

  beforeEach(() => {
    geminiService = new GeminiService(
      {
        apiKey: 'sk-mock-api-key',
        model: 'gemini-lite',
        maxTokens: 500,
        temperature: 0.7,
        trackingEnabled: true,
        pricing: {
          'gemini-lite': {
            inputCostPer1kTokens: 0.005,
            outputCostPer1kTokens: 0.007,
          },
        },
      },
      {
        language: 'TypeScript',
        frameworkInfo: 'jest',
      },
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with provided config', () => {
    expect(geminiService).toBeDefined();
  });

  describe('generateResponse', () => {
    it('should call Gemini API and return content', async () => {
      const response = await geminiService.generateResponse('Test prompt');
      expect(response.content).toBe('This is a mock response from Gemini');
      expect(response.success).toBe(true);
    });

    it('should track the API request', async () => {
      await geminiService.generateResponse('Test prompt');
      const requests = geminiService.getRequests();
      expect(requests.length).toBe(1);
      expect(requests[0].prompt).toBe('Test prompt');
      expect(requests[0].success).toBe(true);
    });

    it('should calculate token usage and costs', async () => {
      await geminiService.generateResponse('Test prompt');
      const requests = geminiService.getRequests();

      expect(requests[0].inputTokens).toBe(8);
      expect(requests[0].outputTokens).toBe(12);
      expect(requests[0].totalTokens).toBe(20);

      // Cost calculation for gemini-lite:
      // (8/1000 * 0.005) + (12/1000 * 0.007) = 0.00004 + 0.000084 = 0.000124
      expect(requests[0].cost).toBeCloseTo(0.000124);
    });
  });

  describe('reviewPullRequest', () => {
    beforeEach(() => {
      const mockCreate = jest.fn().mockResolvedValue({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              comments: [
                {
                  path: 'src/test.ts',
                  body: 'Test comment for Gemini',
                  position: 1,
                },
              ],
              summary: 'Test review summary for Gemini',
              approved: true,
            }),
          },
        ],
        model: 'gemini-lite',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 8,
          output_tokens: 12,
        },
      });

      // @ts-ignore - Accessing private property for testing
      geminiService.client = {
        messages: {
          create: mockCreate,
        },
      } as unknown;
    });

    it('should generate a PR review', async () => {
      const files = [
        {
          filename: 'src/test.ts',
          content: 'console.log("gemini test");',
          patch: '@@ -0,0 +1 @@\n+console.log("gemini test");',
        },
      ];

      const review = await geminiService.reviewPullRequest(files);

      expect(review.comments.length).toBe(1);
      expect(review.comments[0].path).toBe('src/test.ts');
      expect(review.summary).toBe('Test review summary for Gemini');
      expect(review.approved).toBe(true);
    });
  });

  describe('generateTests', () => {
    beforeEach(() => {
      const mockCreate = jest.fn().mockResolvedValue({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'test("should work with Gemini", () => {\n  expect(true).toBe(true);\n});',
          },
        ],
        model: 'gemini-lite',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 8,
          output_tokens: 12,
        },
      });

      // @ts-ignore - Accessing private property for testing
      geminiService.client = {
        messages: {
          create: mockCreate,
        },
      } as unknown;
    });

    it('should generate test code', async () => {
      const testCode = await geminiService.generateTests(
        'src/utils/test.ts',
        'export function multiply(a: number, b: number): number { return a * b; }',
      );

      expect(testCode).toContain('test(');
      expect(testCode).toContain('expect(true).toBe(true)');
    });
  });

  describe('Analytics', () => {
    beforeEach(async () => {
      geminiService.clearRequests();

      const mockCreate = jest.fn().mockResolvedValueOnce({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response 1 from Gemini' }],
        model: 'gemini-lite',
        stop_reason: 'end_turn',
        usage: { input_tokens: 8, output_tokens: 12, total_tokens: 20 },
      });

      // @ts-ignore - Accessing private property for testing
      geminiService.client = {
        messages: {
          create: mockCreate,
        },
      } as unknown;

      await geminiService.generateResponse('Prompt 1');
    });

    it('should track token usage and cost', () => {
      const requests = geminiService.getRequests();
      expect(requests.length).toBe(2);

      expect(requests[0].inputTokens).toBe(8);
      expect(requests[0].outputTokens).toBe(12);
      expect(requests[0].totalTokens).toBe(20);
      expect(requests[0].cost).toBeCloseTo((8 / 1000) * 0.005 + (12 / 1000) * 0.007);
    });

    it('should provide usage analytics', () => {
      const analytics = geminiService.getUsageAnalytics();

      expect(analytics.totalRequests).toBe(2);
      expect(analytics.successfulRequests).toBe(2);
      expect(analytics.failedRequests).toBe(0);
      expect(analytics.totalTokens).toBe(120); // 20 + 100
      expect(analytics.inputTokens).toBe(48); // 8 + 40
      expect(analytics.outputTokens).toBe(72); // 12 + 60

      // Calculate expected cost:
      // gemini-lite: (8/1000 * 0.005) + (12/1000 * 0.007) = 0.00004 + 0.000084 = 0.000124
      // gemini-pro: (40/1000 * 0.01) + (60/1000 * 0.015) = 0.0004 + 0.0009 = 0.0013
      // Total: 0.000124 + 0.0013 = 0.001424
      expect(analytics.totalCost).toBeCloseTo(0.001424);

      expect(analytics.requestsByModel).toEqual({
        'gemini-lite': 1,
        'gemini-pro': 1,
      });
    });

    it('should provide cost breakdown by model', () => {
      const breakdown = geminiService.getCostBreakdown();

      expect(Object.keys(breakdown).length).toBe(2);

      expect(breakdown['gemini-lite'].requests).toBe(1);
      expect(breakdown['gemini-lite'].tokens).toBe(20);
      expect(breakdown['gemini-lite'].cost).toBeCloseTo((8 / 1000) * 0.005 + (12 / 1000) * 0.007);
    });

    it('should filter analytics by date range', () => {
      const requests = geminiService.getRequests();

      // Set first request to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      requests[0].timestamp = yesterday;

      // Set second request to today
      const today = new Date();
      requests[1].timestamp = today;

      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);

      const yesterdayAnalytics = geminiService.getUsageAnalytics(yesterday, yesterdayEnd);
      expect(yesterdayAnalytics.totalRequests).toBe(1);
      expect(yesterdayAnalytics.totalTokens).toBe(20);

      const todayAnalytics = geminiService.getUsageAnalytics(todayStart);
      expect(todayAnalytics.totalRequests).toBe(1);
      expect(todayAnalytics.totalTokens).toBe(100);
    });
  });
});
