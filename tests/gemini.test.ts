import { GeminiService } from '../src/services/models/gemini';
import { CodeBaseConfig, ModelConfig } from '../src/types';

// Mock the entire @google/generative-ai module
jest.mock('@google/generative-ai', () => {
  const mockGenerateContent = jest.fn();
  const mockGetGenerativeModel = jest.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  });
  const mockGoogleGenerativeAI = jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  }));

  return {
    GoogleGenerativeAI: mockGoogleGenerativeAI,
    // Mocking enums or other runtime values might be needed if used,
    // but typically not required for types/interfaces.
  };
});

// Mock the logger utility
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
  // Mock Logger class if it's used directly via getInstance
  Logger: {
    getInstance: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      logApiCall: jest.fn(),
    }),
  },
}));

describe('GeminiService', () => {
  let geminiService: GeminiService;
  let mockGenerateContent: jest.Mock;
  let mockGetGenerativeModel: jest.Mock;
  let mockGoogleGenerativeAI: jest.Mock;

  const testModelConfig: ModelConfig = {
    apiKey: 'sk-mock-api-key',
    model: 'gemini-lite',
    maxTokens: 500,
    temperature: 0.7,
    trackingEnabled: true,
    pricing: {
      'gemini-lite': { inputCostPer1kTokens: 0.005, outputCostPer1kTokens: 0.007 },
      'gemini-pro': { inputCostPer1kTokens: 0.01, outputCostPer1kTokens: 0.015 },
    },
  };

  const testCodeBaseConfig: CodeBaseConfig = {
    language: 'TypeScript',
    frameworkInfo: 'jest',
  };

  // Capture mock references after jest.mock runs
  beforeAll(() => {
    const generativeAiMock = require('@google/generative-ai');
    mockGoogleGenerativeAI = generativeAiMock.GoogleGenerativeAI;
    // Simulate instantiation to reliably get nested mocks
    const mockInstance = new mockGoogleGenerativeAI();
    mockGetGenerativeModel = mockInstance.getGenerativeModel;
    const mockModel = mockGetGenerativeModel();
    mockGenerateContent = mockModel.generateContent;
  });

  beforeEach(() => {
    // Reset mocks and request tracking before each test
    jest.clearAllMocks();
    if (mockGenerateContent) {
      // Set a default successful response for generateContent
      mockGenerateContent.mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue('Default mock response'),
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
        },
      });
    } else {
      // Fallback if mock capture failed, though this indicates a setup issue
      console.error('mockGenerateContent was not captured correctly in beforeAll.');
    }

    geminiService = new GeminiService(testModelConfig, testCodeBaseConfig);
    // Ensure requests are cleared if ProviderService isn't reinstantiated fully
    geminiService.clearRequests();
  });

  it('should initialize correctly', () => {
    expect(geminiService).toBeDefined();
    expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('sk-mock-api-key');
  });

  describe('generateResponse', () => {
    it('should call the API via getGenerativeModel and generateContent', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('Specific test response'),
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12 },
        },
      });

      const response = await geminiService.generateResponse('Test prompt');

      expect(response.success).toBe(true);
      expect(response.content).toBe('Specific test response');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-lite' });
      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: 'Test prompt' }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
      });
    });

    it('should track successful requests with tokens and cost', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('Tracking test response'),
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12 },
        },
      });

      await geminiService.generateResponse('Track me');
      const requests = geminiService.getRequests();

      expect(requests.length).toBe(1);
      expect(requests[0].success).toBe(true);
      expect(requests[0].prompt).toBe('Track me');
      expect(requests[0].inputTokens).toBe(8);
      expect(requests[0].outputTokens).toBe(12);
      expect(requests[0].totalTokens).toBe(20);
      expect(requests[0].cost).toBeCloseTo(0.000124); // (8/1k * 0.005) + (12/1k * 0.007)
      expect(requests[0].options.model).toBe('gemini-lite');
      expect(requests[0].latency).toBeGreaterThanOrEqual(0);
      expect(requests[0].error).toBeUndefined();
    });

    it('should handle API errors and track failed requests', async () => {
      const apiError = new Error('API Failure');
      mockGenerateContent.mockRejectedValueOnce(apiError);

      const response = await geminiService.generateResponse('Error prompt');

      expect(response.success).toBe(false);
      expect(response.content).toBe('');
      expect(response.error).toBe(apiError);

      const requests = geminiService.getRequests();
      expect(requests.length).toBe(1);
      expect(requests[0].success).toBe(false);
      expect(requests[0].prompt).toBe('Error prompt');
      expect(requests[0].error).toBe(apiError);
      expect(requests[0].inputTokens).toBeUndefined();
      expect(requests[0].cost).toBeUndefined();
    });
  });

  describe('reviewPullRequest', () => {
    const mockReviewJsonResponse = JSON.stringify({
      comments: [{ path: 'src/review.ts', body: 'Review comment', position: 5 }],
      summary: 'Overall review looks good.',
      approved: true,
    });

    const files = [
      {
        filename: 'src/review.ts',
        content: 'const code = "example";',
        patch: '@@ -1 +1 @@\n-const code = "old";\n+const code = "example";',
      },
    ];

    it('should call generateResponse and parse the JSON review', async () => {
      // Setup generateContent to return the expected JSON string
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue(mockReviewJsonResponse),
          usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 150 },
        },
      });

      const review = await geminiService.reviewPullRequest(files);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      // Check that the prompt contains expected structure/keywords
      const calledPrompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(calledPrompt).toContain('You are an experienced senior software engineer');
      expect(calledPrompt).toContain('Provide your review in JSON format');
      expect(calledPrompt).toContain(files[0].filename);
      expect(calledPrompt).toContain(files[0].content);
      expect(calledPrompt).toContain(files[0].patch);

      // Check the parsed result
      expect(review.summary).toBe('Overall review looks good.');
      expect(review.approved).toBe(true);
      expect(review.comments.length).toBe(1);
      expect(review.comments[0].path).toBe('src/review.ts');
    });

    it('should throw an error if JSON parsing fails', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('this is not valid json {'),
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
        },
      });

      await expect(geminiService.reviewPullRequest(files)).rejects.toThrow(
        /Failed to parse response as JSON/,
      );
    });

    it('should throw an error if generateResponse fails', async () => {
      const apiError = new Error('Review API failed');
      mockGenerateContent.mockRejectedValueOnce(apiError);

      // The error message now includes the original error from generateResponse
      await expect(geminiService.reviewPullRequest(files)).rejects.toThrow(
        `Failed to generate PR review: ${apiError.message}`,
      );
    });
  });

  describe('generateTests', () => {
    const mockTestCode =
      'test("should multiply correctly", () => { expect(multiply(2, 3)).toBe(6); });';
    const filePath = 'src/math.ts';
    const fileContent = 'export function multiply(a: number, b: number): number { return a * b; }';

    it('should call generateResponse and return the test code string', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue(mockTestCode),
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80 },
        },
      });

      const generatedTests = await geminiService.generateTests(filePath, fileContent);

      expect(generatedTests).toBe(mockTestCode);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      // Check the prompt sent
      const calledPrompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(calledPrompt).toContain('generate test cases for the following code file');
      expect(calledPrompt).toContain(testCodeBaseConfig.frameworkInfo);
      expect(calledPrompt).toContain(filePath);
      expect(calledPrompt).toContain(fileContent);
      expect(calledPrompt).toContain('Return only the test code');
    });

    it('should throw an error if generateResponse fails', async () => {
      const apiError = new Error('Test Gen API failed');
      mockGenerateContent.mockRejectedValueOnce(apiError);

      await expect(geminiService.generateTests(filePath, fileContent)).rejects.toThrow(
        `Failed to generate tests: ${apiError.message}`,
      );
    });
  });

  describe('respondToComment', () => {
    const userComment = 'What about edge cases?';
    const codeContext = 'if (value > 0) { return true; }';
    const mockAiResponse = 'Good point. We should add tests for zero and negative numbers.';

    it('should call generateResponse with the comment and context', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue(mockAiResponse),
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 30 },
        },
      });

      const response = await geminiService.respondToComment(userComment, codeContext);

      expect(response).toBe(mockAiResponse);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const calledPrompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(calledPrompt).toContain('A developer has replied');
      expect(calledPrompt).toContain(userComment);
      expect(calledPrompt).toContain(codeContext);
    });

    it('should throw an error if generateResponse fails', async () => {
      const apiError = new Error('Comment Response API failed');
      mockGenerateContent.mockRejectedValueOnce(apiError);

      await expect(geminiService.respondToComment(userComment, codeContext)).rejects.toThrow(
        `Failed to generate comment response: ${apiError.message}`,
      );
    });
  });

  describe('Analytics', () => {
    beforeEach(async () => {
      // Setup multiple calls with different models/tokens for analytics tests
      // API Call 1: gemini-lite (default), 8 in / 12 out
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('Response 1 Lite'),
          usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12 },
        },
      });
      // API Call 2: gemini-pro, 40 in / 60 out
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: jest.fn().mockReturnValue('Response 2 Pro'),
          usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 60 },
        },
      });

      // --- Make the calls ---
      await geminiService.generateResponse('Prompt 1 Lite');
      // Temporarily change config model for the second call
      // @ts-ignore - Accessing private config for testing
      geminiService.config.model = 'gemini-pro';
      await geminiService.generateResponse('Prompt 2 Pro');
      // Reset config model
      // @ts-ignore
      geminiService.config.model = 'gemini-lite';
    });

    it('should provide correct aggregate usage analytics', () => {
      const analytics = geminiService.getUsageAnalytics();

      expect(analytics.totalRequests).toBe(2);
      expect(analytics.successfulRequests).toBe(2);
      expect(analytics.failedRequests).toBe(0);
      expect(analytics.totalTokens).toBe(120); // (8+12) + (40+60)
      expect(analytics.inputTokens).toBe(48); // 8 + 40
      expect(analytics.outputTokens).toBe(72); // 12 + 60
      const expectedTotalCost =
        (8 / 1000) * 0.005 + (12 / 1000) * 0.007 + ((40 / 1000) * 0.01 + (60 / 1000) * 0.015); // ~0.000124 + 0.0013
      expect(analytics.totalCost).toBeCloseTo(expectedTotalCost); // ~0.001424
      expect(analytics.requestsByModel).toEqual({
        'gemini-lite': 1,
        'gemini-pro': 1,
      });
    });

    it('should provide correct cost breakdown by model', () => {
      const breakdown = geminiService.getCostBreakdown();

      expect(Object.keys(breakdown)).toEqual(['gemini-lite', 'gemini-pro']);
      expect(breakdown['gemini-lite'].requests).toBe(1);
      expect(breakdown['gemini-lite'].tokens).toBe(20);
      expect(breakdown['gemini-lite'].cost).toBeCloseTo(0.000124);
      expect(breakdown['gemini-pro'].requests).toBe(1);
      expect(breakdown['gemini-pro'].tokens).toBe(100);
      expect(breakdown['gemini-pro'].cost).toBeCloseTo(0.0013);
    });

    it('should filter analytics by date range', () => {
      const requests = geminiService.getRequests();
      const now = Date.now();
      const yesterdayTimestamp = now - 24 * 60 * 60 * 1000;

      // Set first request (lite, 20 tokens) to yesterday, second (pro, 100 tokens) to now
      requests[0].timestamp = new Date(yesterdayTimestamp);
      requests[1].timestamp = new Date(now);

      const yesterdayStart = new Date(yesterdayTimestamp);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayTimestamp);
      yesterdayEnd.setHours(23, 59, 59, 999);
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      // Filter: Yesterday only
      const yesterdayAnalytics = geminiService.getUsageAnalytics(yesterdayStart, yesterdayEnd);
      expect(yesterdayAnalytics.totalRequests).toBe(1);
      expect(yesterdayAnalytics.totalTokens).toBe(20);

      // Filter: Today only
      const todayAnalytics = geminiService.getUsageAnalytics(todayStart);
      expect(todayAnalytics.totalRequests).toBe(1);
      expect(todayAnalytics.totalTokens).toBe(100);
    });
  });
});
