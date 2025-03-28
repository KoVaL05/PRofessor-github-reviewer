import { CodeReview, ReviewComment } from '../types';
import { GithubService } from './github';
import { ClaudeService } from './claude';
import { logger } from '../utils/logger';

export class CodeReviewerService {
  public githubService: GithubService;
  private claudeService: ClaudeService;

  constructor(githubService: GithubService, claudeService: ClaudeService) {
    this.githubService = githubService;
    this.claudeService = claudeService;
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

    // Use Claude to analyze the PR and generate a review
    try {
      const reviewFiles = fileContents
        .filter((item) => !item.error && item.content)
        .map((item) => ({
          filename: item.file.filename,
          content: item.content,
          patch: item.file.patch,
        }));

      // Skip review if no files to review
      if (reviewFiles.length === 0) {
        return {
          comments: [],
          summary: `No reviewable files found in PR #${prNumber}: ${pr.title}`,
          approved: false,
        };
      }

      // Generate review using Claude
      const aiReview = await this.claudeService.reviewPullRequest(reviewFiles);

      return {
        comments: aiReview.comments,
        summary:
          aiReview.summary || `Reviewed ${files.length} files in PR #${prNumber}: ${pr.title}`,
        approved: aiReview.approved,
      };
    } catch (error) {
      console.error('Error generating AI review:', error);

      // Fallback to basic review if AI review fails
      const comments = fileContents
        .filter((item) => !item.error && item.content)
        .map((item) => ({
          body: `Reviewed file: ${item.file.filename}`,
          path: item.file.filename,
          position: 1,
        }));

      return {
        comments,
        summary: `Reviewed ${files.length} files in PR #${prNumber}: ${pr.title} (AI review failed)`,
        approved: false,
      };
    }
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

  /**
   * Generate tests for a file
   */
  async generateTests(
    filePath: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> {
    try {
      // Get the file content
      const fileContent = await this.githubService.getFileContent(owner, repo, filePath, branch);

      // Generate tests using Claude
      return await this.claudeService.generateTests(filePath, fileContent);
    } catch (error) {
      logger.error(`Error generating tests for ${filePath}:`, error);
      throw new Error(`Failed to generate tests for ${filePath}: ${error}`);
    }
  }

  /**
   * Handle a comment on a PR that was made in response to one of the bot's comments
   */
  async handleCommentResponse(
    owner: string,
    repo: string,
    prNumber: number,
    comment: ReviewComment,
  ): Promise<void> {
    try {
      // Get all comments to find the original bot comment this is responding to
      const allComments = await this.githubService.getReviewComments(owner, repo, prNumber);

      // Check if this is a reply to a bot comment
      if (!comment.in_reply_to_id) {
        logger.debug('Comment is not a reply, ignoring');
        return;
      }

      // Find the original comment this is replying to
      const originalComment = allComments.find((c) => c.id === comment.in_reply_to_id);

      if (!originalComment || !this.githubService.isBotComment(originalComment)) {
        logger.debug('Comment is not replying to a bot comment, ignoring');
        return;
      }

      logger.info(`Processing reply to bot comment: ${comment.body}`);

      // Get file context if available from a review comment
      let codeContext = '';
      try {
        const reviewComments = await this.githubService.getReviewComments(owner, repo, prNumber);
        // Try to find a matching review comment with the same ID or body to get the file context
        const matchingReviewComment = reviewComments.find(
          (rc) => rc.id === originalComment.id || rc.body === originalComment.body,
        );

        if (matchingReviewComment && matchingReviewComment.path) {
          const fileContent = await this.githubService.getFileContent(
            owner,
            repo,
            matchingReviewComment.path,
            'HEAD',
          );
          codeContext = `${matchingReviewComment.path}:\n${fileContent}`;
        }
      } catch (error) {
        logger.warn('Could not get code context for reply:', error);
      }

      // Generate response using Claude
      const aiResponse = await this.claudeService.respondToComment(comment.body, codeContext);

      // Ensure comment.id is defined before using it
      if (!comment.id) {
        throw new Error('Cannot reply to a comment without an id');
      }
      // Post the response
      await this.githubService.createReplyComment(owner, repo, prNumber, aiResponse, comment.id);

      logger.info(`Posted AI response to comment #${comment.id}`);
    } catch (error) {
      logger.error('Error handling comment response:', error);
    }
  }
}
