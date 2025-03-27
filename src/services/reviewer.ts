import { CodeReview, PullRequest, PullRequestFile } from '../types';
import { GithubService } from './github';

export class CodeReviewerService {
  private githubService: GithubService;

  constructor(githubService: GithubService) {
    this.githubService = githubService;
  }

  async reviewPullRequest(owner: string, repo: string, prNumber: number): Promise<CodeReview> {
    // Fetch the PR and its files
    const pr = await this.githubService.getPullRequest(owner, repo, prNumber);
    const files = await this.githubService.getPullRequestFiles(owner, repo, prNumber);

    // Get the content of each file
    const fileContents = await Promise.all(
      files.map(async (file) => {
        try {
          if (file.status === 'removed') {
            return { file, content: '' };
          }
          const content = await this.githubService.getFileContent(
            owner,
            repo,
            file.filename,
            pr.head.sha,
          );
          return { file, content };
        } catch (error) {
          console.error(`Error getting content for ${file.filename}:`, error);
          return { file, content: '', error };
        }
      }),
    );

    // TODO: This is where AI analysis would happen
    // For now, we'll just return a placeholder review
    const comments = fileContents
      .filter((item) => !item.error && item.content)
      .map((item) => ({
        body: `Reviewed file: ${item.file.filename}`,
        path: item.file.filename,
        position: 1,
      }));

    return {
      comments,
      summary: `Reviewed ${files.length} files in PR #${prNumber}: ${pr.title}`,
      approved: true, // This would be determined by AI analysis
    };
  }

  async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    review: CodeReview,
  ): Promise<void> {
    const pr = await this.githubService.getPullRequest(owner, repo, prNumber);

    // Submit review
    await this.githubService.createReview(
      owner,
      repo,
      prNumber,
      pr.head.sha,
      review.summary,
      review.approved ? 'APPROVE' : 'COMMENT',
      review.comments.map((comment) => ({
        path: comment.path,
        position: comment.position || 1,
        body: comment.body,
      })),
    );
  }
}
