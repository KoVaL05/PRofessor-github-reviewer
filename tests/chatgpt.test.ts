import { ChatGPTService } from '../src/services/models/chatgpt';

// Mock the OpenAI client
jest.mock('@openai/openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'This is a mock response from ChatGPT',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 15,
            total_tokens: 25,
          },
        }),
        // Correctly structure messages with required properties
        messages: {
          list: jest.fn(),
          _client: {}, // Mocked client reference
        },
        retrieve: jest.fn(),
        update: jest.fn(),
        list: jest.fn(),
        runTools: jest.fn(),
        stream: jest.fn(),
      },
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

describe('ChatGPTService', () => {
  let chatGPTService: ChatGPTService;

  beforeEach(() => {
    chatGPTService = new ChatGPTService(
      {
        apiKey: 'sk-mock-api-key',
        model: 'gpt-3.5-turbo',
        maxTokens: 500,
        temperature: 0.7,
        trackingEnabled: true,
        pricing: {
          'gpt-3.5-turbo': {
            inputCostPer1kTokens: 0.002,
            outputCostPer1kTokens: 0.0025,
          },
          'gpt-4': {
            inputCostPer1kTokens: 0.06,
            outputCostPer1kTokens: 0.12,
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
    expect(chatGPTService).toBeDefined();
  });

  describe('generateResponse', () => {
    it('should call ChatGPT API and return content', async () => {
      const response = await chatGPTService.generateResponse('Test prompt');
      expect(response.content).toBe('This is a mock response from ChatGPT');
      expect(response.success).toBe(true);
    });

    it('should track the API request', async () => {
      await chatGPTService.generateResponse('Test prompt');
      const requests = chatGPTService.getRequests();
      expect(requests.length).toBe(1);
      expect(requests[0].prompt).toBe('Test prompt');
      expect(requests[0].success).toBe(true);
    });

    it('should calculate token usage and costs', async () => {
      await chatGPTService.generateResponse('Test prompt');
      const requests = chatGPTService.getRequests();

      expect(requests[0].inputTokens).toBe(10);
      expect(requests[0].outputTokens).toBe(15);
      expect(requests[0].totalTokens).toBe(25);

      // Cost calculation for gpt-3.5-turbo:
      // (10/1000 * 0.002) + (15/1000 * 0.0025) = 0.00002 + 0.0000375 = 0.0000575
      expect(requests[0].cost).toBeCloseTo(0.0000575);
    });
  });

  describe('reviewPullRequest', () => {
    // Mock the OpenAI client for this specific test
    beforeEach(() => {
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
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
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      });

      // @ts-ignore - Accessing private property for testing
      chatGPTService.client.chat.completions = {
        create: mockCreate,
      };
    });

    it('should generate a PR review', async () => {
      const files = [
        {
          filename: 'src/test.ts',
          content: 'console.log("test");',
          patch: '@@ -0,0 +1 @@\n+console.log("test");',
        },
      ];

      const review = await chatGPTService.reviewPullRequest(files);

      expect(review.comments.length).toBe(1);
      expect(review.comments[0].path).toBe('src/test.ts');
      expect(review.summary).toBe('Test review summary');
      expect(review.approved).toBe(true);
    });
  });

  describe('generateTests', () => {
    // Mock the OpenAI client for this specific test
    beforeEach(() => {
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'test("should do something", () => {\n  expect(true).toBe(true);\n});',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      });

      // @ts-ignore - Accessing private property for testing
      chatGPTService.client.chat.completions = {
        create: mockCreate,
      };
    });

    it('should generate test code', async () => {
      const testCode = await chatGPTService.generateTests(
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
      chatGPTService.clearRequests();

      // Create some mock responses with different timestamps for testing
      const mockCreate = jest
        .fn()
        .mockResolvedValueOnce({
          choices: [
            {
              message: { role: 'assistant', content: 'Response 1' },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: { role: 'assistant', content: 'Response 2' },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
        });

      // @ts-ignore - Accessing private property for testing
      chatGPTService.client.chat.completions = {
        create: mockCreate,
      };

      // Generate two requests with different models
      await chatGPTService.generateResponse('Prompt 1', { model: 'gpt-3.5-turbo' });
      await chatGPTService.generateResponse('Prompt 2', { model: 'gpt-4' });
    });

    it('should track token usage and cost', () => {
      const requests = chatGPTService.getRequests();
      expect(requests.length).toBe(2);

      // First request (gpt-3.5-turbo)
      expect(requests[0].inputTokens).toBe(10);
      expect(requests[0].outputTokens).toBe(20);
      expect(requests[0].totalTokens).toBe(30);
      expect(requests[0].cost).toBeCloseTo((10 / 1000) * 0.002 + (20 / 1000) * 0.0025);

      // Second request (gpt-4)
      expect(requests[1].inputTokens).toBe(50);
      expect(requests[1].outputTokens).toBe(100);
      expect(requests[1].totalTokens).toBe(150);
      expect(requests[1].cost).toBeCloseTo((50 / 1000) * 0.06 + (100 / 1000) * 0.12);
    });

    it('should provide usage analytics', () => {
      const analytics = chatGPTService.getUsageAnalytics();

      expect(analytics.totalRequests).toBe(2);
      expect(analytics.successfulRequests).toBe(2);
      expect(analytics.failedRequests).toBe(0);
      expect(analytics.totalTokens).toBe(180); // 30 + 150
      expect(analytics.inputTokens).toBe(60); // 10 + 50
      expect(analytics.outputTokens).toBe(120); // 20 + 100

      // Calculate expected cost: gpt-3.5-turbo + gpt-4
      // gpt-3.5-turbo: (10/1000 * 0.002) + (20/1000 * 0.0025) = 0.00002 + 0.00005 = 0.00007
      // gpt-4: (50/1000 * 0.06) + (100/1000 * 0.12) = 0.003 + 0.012 = 0.015
      // Total: 0.00007 + 0.015 = 0.01507
      expect(analytics.totalCost).toBeCloseTo(0.01507);

      expect(analytics.requestsByModel).toEqual({
        'gpt-3.5-turbo': 1,
        'gpt-4': 1,
      });
    });

    it('should provide cost breakdown by model', () => {
      const breakdown = chatGPTService.getCostBreakdown();

      expect(Object.keys(breakdown).length).toBe(2);

      expect(breakdown['gpt-3.5-turbo'].requests).toBe(1);
      expect(breakdown['gpt-3.5-turbo'].tokens).toBe(30);
      expect(breakdown['gpt-3.5-turbo'].cost).toBeCloseTo(
        (10 / 1000) * 0.002 + (20 / 1000) * 0.0025,
      );

      expect(breakdown['gpt-4'].requests).toBe(1);
      expect(breakdown['gpt-4'].tokens).toBe(150);
      expect(breakdown['gpt-4'].cost).toBeCloseTo((50 / 1000) * 0.06 + (100 / 1000) * 0.12);
    });

    it('should filter analytics by date range', () => {
      // Create requests with specific timestamps for testing
      const requests = chatGPTService.getRequests();

      // Set first request to yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      requests[0].timestamp = yesterday;

      // Set second request to today
      const today = new Date();
      requests[1].timestamp = today;

      // Define date ranges
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);

      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);

      // Get analytics for yesterday only
      const yesterdayAnalytics = chatGPTService.getUsageAnalytics(yesterday, yesterdayEnd);
      expect(yesterdayAnalytics.totalRequests).toBe(1);
      expect(yesterdayAnalytics.totalTokens).toBe(30);

      // Get analytics for today only
      const todayAnalytics = chatGPTService.getUsageAnalytics(todayStart);
      expect(todayAnalytics.totalRequests).toBe(1);
      expect(todayAnalytics.totalTokens).toBe(150);
    });
  });
});
