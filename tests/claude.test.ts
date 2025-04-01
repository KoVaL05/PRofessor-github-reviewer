import { ClaudeService } from '../src/services/models/claude';

// Mock the Anthropic client
jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'This is a mock response' }],
        model: 'claude-3-haiku-20240307',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 15,
        },
      }),
      batches: jest.fn(),
      stream: jest.fn(),
      countTokens: jest.fn(),
      _client: {},
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

describe('ClaudeService', () => {
  let claudeService: ClaudeService;

  beforeEach(() => {
    claudeService = new ClaudeService(
      {
        apiKey: 'sk-mock-api-key',
        model: 'claude-3-haiku-20240307',
        maxTokens: 500,
        temperature: 0.7,
        trackingEnabled: true,
        pricing: {
          'claude-3-haiku-20240307': {
            inputCostPer1kTokens: 0.25,
            outputCostPer1kTokens: 0.75,
          },
          'claude-3-sonnet-20240229': {
            inputCostPer1kTokens: 3.0,
            outputCostPer1kTokens: 15.0,
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
    expect(claudeService).toBeDefined();
  });

  describe('generateResponse', () => {
    it('should call Claude API and return content', async () => {
      const response = await claudeService.generateResponse('Test prompt');
      expect(response.content).toBe('This is a mock response');
      expect(response.success).toBe(true);
    });

    it('should track the API request', async () => {
      await claudeService.generateResponse('Test prompt');
      const requests = claudeService.getRequests();
      expect(requests.length).toBe(1);
      expect(requests[0].prompt).toBe('Test prompt');
      expect(requests[0].success).toBe(true);
    });
    it('should calculate token usage and costs', async () => {
      await claudeService.generateResponse('Test prompt');
      const requests = claudeService.getRequests();

      expect(requests[0].inputTokens).toBe(10);
      expect(requests[0].outputTokens).toBe(15);
      expect(requests[0].totalTokens).toBe(25);

      // Cost calculation: (10/1000 * 0.25) + (15/1000 * 0.75) = 0.0025 + 0.01125 = 0.01375
      expect(requests[0].cost).toBeCloseTo(0.01375);
    });
  });

  describe('reviewPullRequest', () => {
    // Mock the Anthropic client for this specific test
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
                  body: 'Test comment',
                  position: 1,
                },
              ],
              summary: 'Test review summary',
              approved: true,
            }),
          },
        ],
        model: 'claude-3-haiku-20240307',
        stop_reason: 'end_turn',
      });

      // @ts-ignore - Accessing private property for testing
      claudeService.client = {
        messages: {
          create: mockCreate,
        },
      } as unknown;
    });

    it('should generate a PR review', async () => {
      const files = [
        {
          filename: 'src/test.ts',
          content: 'console.log("test");',
          patch: '@@ -0,0 +1 @@\n+console.log("test");',
        },
      ];

      const review = await claudeService.reviewPullRequest(files);

      expect(review.comments.length).toBe(1);
      expect(review.comments[0].path).toBe('src/test.ts');
      expect(review.summary).toBe('Test review summary');
      expect(review.approved).toBe(true);
    });
  });

  describe('generateTests', () => {
    // Mock the Anthropic client for this specific test
    beforeEach(() => {
      const mockCreate = jest.fn().mockResolvedValue({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'test("should do something", () => {\n  expect(true).toBe(true);\n});',
          },
        ],
        model: 'claude-3-haiku-20240307',
        stop_reason: 'end_turn',
      });

      // @ts-ignore - Accessing private property for testing
      claudeService.client = {
        messages: {
          create: mockCreate,
        },
      } as unknown;
    });

    it('should generate test code', async () => {
      const testCode = await claudeService.generateTests(
        'src/utils/test.ts',
        'export function add(a: number, b: number): number { return a + b; }',
      );

      expect(testCode).toContain('test(');
      expect(testCode).toContain('expect(true).toBe(true)');
    });
  });

  describe('Analytics', () => {
    beforeEach(async () => {
      // Clear previous requests
      claudeService.clearRequests();

      // Create some mock requests with different timestamps for testing
      const mockCreate = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'msg_1',
          content: [{ type: 'text', text: 'Response 1' }],
          model: 'claude-3-haiku-20240307',
          usage: { input_tokens: 10, output_tokens: 20 },
        })
        .mockResolvedValueOnce({
          id: 'msg_2',
          content: [{ type: 'text', text: 'Response 2' }],
          model: 'claude-3-sonnet-20240229',
          usage: { input_tokens: 50, output_tokens: 100 },
        });

      // @ts-ignore - Accessing private property for testing
      claudeService.client = {
        messages: {
          create: mockCreate,
        },
      } as unknown;

      // Generate two requests with different models
      await claudeService.generateResponse('Prompt 1', { model: 'claude-3-haiku-20240307' });
      await claudeService.generateResponse('Prompt 2', { model: 'claude-3-sonnet-20240229' });
    });

    it('should track token usage and cost', () => {
      const requests = claudeService.getRequests();
      expect(requests.length).toBe(2);

      // First request (Haiku)
      expect(requests[0].inputTokens).toBe(10);
      expect(requests[0].outputTokens).toBe(20);
      expect(requests[0].totalTokens).toBe(30);
      expect(requests[0].cost).toBeCloseTo((10 / 1000) * 0.25 + (20 / 1000) * 0.75);

      // Second request (Sonnet)
      expect(requests[1].inputTokens).toBe(50);
      expect(requests[1].outputTokens).toBe(100);
      expect(requests[1].totalTokens).toBe(150);
      expect(requests[1].cost).toBeCloseTo((50 / 1000) * 3.0 + (100 / 1000) * 15.0);
    });

    it('should provide usage analytics', () => {
      const analytics = claudeService.getUsageAnalytics();

      expect(analytics.totalRequests).toBe(2);
      expect(analytics.successfulRequests).toBe(2);
      expect(analytics.failedRequests).toBe(0);
      expect(analytics.totalTokens).toBe(180); // 30 + 150
      expect(analytics.inputTokens).toBe(60); // 10 + 50
      expect(analytics.outputTokens).toBe(120); // 20 + 100

      // Calculate expected cost: Haiku + Sonnet
      // Haiku: (10/1000 * 0.25) + (20/1000 * 0.75) = 0.0025 + 0.015 = 0.0175
      // Sonnet: (50/1000 * 3.0) + (100/1000 * 15.0) = 0.15 + 1.5 = 1.65
      // Total: 0.0175 + 1.65 = 1.6675
      expect(analytics.totalCost).toBeCloseTo(1.6675);

      expect(analytics.requestsByModel).toEqual({
        'claude-3-haiku-20240307': 1,
        'claude-3-sonnet-20240229': 1,
      });
    });

    it('should provide cost breakdown by model', () => {
      const breakdown = claudeService.getCostBreakdown();

      expect(Object.keys(breakdown).length).toBe(2);

      expect(breakdown['claude-3-haiku-20240307'].requests).toBe(1);
      expect(breakdown['claude-3-haiku-20240307'].tokens).toBe(30);
      expect(breakdown['claude-3-haiku-20240307'].cost).toBeCloseTo(0.0175);

      expect(breakdown['claude-3-sonnet-20240229'].requests).toBe(1);
      expect(breakdown['claude-3-sonnet-20240229'].tokens).toBe(150);
      expect(breakdown['claude-3-sonnet-20240229'].cost).toBeCloseTo(1.65);
    });

    it('should filter analytics by date range', () => {
      // Create requests with specific timestamps for testing
      const requests = claudeService.getRequests();

      // Set first request to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      requests[0].timestamp = yesterday;

      // Set second request to today
      const today = new Date();
      requests[1].timestamp = today;

      // Test filtering by date
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);

      // Get analytics for yesterday only
      const yesterdayAnalytics = claudeService.getUsageAnalytics(yesterday, yesterdayEnd);
      expect(yesterdayAnalytics.totalRequests).toBe(1);
      expect(yesterdayAnalytics.totalTokens).toBe(30);

      // Get analytics for today only
      const todayAnalytics = claudeService.getUsageAnalytics(todayStart);
      expect(todayAnalytics.totalRequests).toBe(1);
      expect(todayAnalytics.totalTokens).toBe(150);
    });
  });
});
