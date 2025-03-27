import { GithubService } from '../src/services/github';

// Mock Octokit
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

describe('GithubService', () => {
  let githubService: GithubService;

  beforeEach(() => {
    githubService = new GithubService({ token: 'fake-token' });
  });

  test('getPullRequest returns PR data', async () => {
    const pr = await githubService.getPullRequest('owner', 'repo', 1);
    expect(pr.number).toBe(1);
    expect(pr.title).toBe('Test PR');
  });

  test('getPullRequestFiles returns files data', async () => {
    const files = await githubService.getPullRequestFiles('owner', 'repo', 1);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('test.ts');
    expect(files[0].status).toBe('modified');
  });

  test('getFileContent returns decoded content', async () => {
    const content = await githubService.getFileContent('owner', 'repo', 'test.ts', 'main');
    expect(content).toBe('test content');
  });
});
