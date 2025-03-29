import { ClaudeService } from '../src/services/claude';

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
      }),
      batches: jest.fn(),
      stream: jest.fn(),
      countTokens: jest.fn(),
      _client: {},
    },
  })),
}));

// Mock promptfoo
jest.mock('promptfoo', () => ({
  promptfoo: {
    log: jest.fn().mockResolvedValue({}),
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
});
