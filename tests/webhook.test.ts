import { WebhookService } from '../src/services/webhook';
import { CodeReviewerService } from '../src/services/reviewer';
import { GithubService } from '../src/services/github';
import { ClaudeService } from '../src/services/claude';
import express from 'express';
import { createHmac } from 'crypto';

// Mock dependencies
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => ({
      pulls: {
        get: jest.fn().mockResolvedValue({
          data: { number: 1, title: 'Test PR' },
        }),
        listFiles: jest.fn().mockResolvedValue({
          data: [{ filename: 'test.ts', status: 'modified' }],
        }),
        createReviewComment: jest.fn().mockResolvedValue({}),
        createReview: jest.fn().mockResolvedValue({}),
      },
      repos: {
        getContent: jest.fn().mockResolvedValue({
          data: { content: Buffer.from('test content').toString('base64') },
        }),
      },
    })),
  };
});
jest.mock('../src/services/reviewer');
jest.mock('../src/services/github');
jest.mock('../src/services/claude');
jest.mock('express', () => {
  const json = jest.fn().mockReturnValue(() => {});
  const mockExpress = {
    use: jest.fn(),
    post: jest.fn(),
    get: jest.fn(),
    listen: jest.fn(),
  };
  const expressFn = jest.fn(() => mockExpress);
  Object.defineProperty(expressFn, 'json', {
    value: json,
  });
  return expressFn;
});

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockReviewerService: jest.Mocked<CodeReviewerService>;
  const mockConfig = {
    port: 3000,
    secret: 'test-secret',
    path: '/test-webhook',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup mock reviewer service
    const mockGithubService = new GithubService({
      token: 'test-token',
    }) as jest.Mocked<GithubService>;
    const mockClaudeService = new ClaudeService(
      { apiKey: 'test-key' },
      { language: 'TypeScript', frameworkInfo: 'jest' },
    ) as jest.Mocked<ClaudeService>;
    mockReviewerService = new CodeReviewerService(
      mockGithubService,
      mockClaudeService,
    ) as jest.Mocked<CodeReviewerService>;
    webhookService = new WebhookService(mockReviewerService, mockConfig);
  });

  it('should initialize with the correct configuration', () => {
    expect(express).toHaveBeenCalled();
    const mockApp = express();
    expect(mockApp.use).toHaveBeenCalled();
    expect(mockApp.post).toHaveBeenCalledWith(mockConfig.path, expect.any(Function));
  });

  it('should start listening on the specified port', () => {
    webhookService.start();
    const mockApp = express();
    expect(mockApp.listen).toHaveBeenCalledWith(mockConfig.port, expect.any(Function));
  });

  it('should verify webhook signatures correctly', () => {
    // Access the private method via any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = webhookService as any;
    // Create a valid signature
    const payload = JSON.stringify({ action: 'opened' });
    const hmac = createHmac('sha256', mockConfig.secret);
    const signature = 'sha256=' + hmac.update(Buffer.from(payload)).digest('hex');
    // Mock request with valid signature
    const validReq = {
      headers: {
        'x-hub-signature-256': signature,
      },
      rawBody: Buffer.from(payload),
    };
    // Mock request with invalid signature
    const invalidReq = {
      headers: {
        'x-hub-signature-256': 'sha256=invalid',
      },
      rawBody: Buffer.from(payload),
    };
    expect(service.verifySignature(validReq)).toBe(true);
    expect(service.verifySignature(invalidReq)).toBe(false);
  });
});
