import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { CodeReviewerService } from './reviewer';
import { logger } from '../utils/logger';

export interface WebhookConfig {
  port: number;
  secret: string;
  path?: string;
}

export class WebhookService {
  private app: express.Express;
  private reviewerService: CodeReviewerService;
  private config: WebhookConfig;

  constructor(reviewerService: CodeReviewerService, config: WebhookConfig) {
    this.app = express();
    this.reviewerService = reviewerService;
    this.config = config;

    // Configure middleware
    this.app.use(
      express.json({
        verify: (
          req: express.Request & { rawBody?: Buffer },
          res: express.Response,
          buf: Buffer,
        ) => {
          req.rawBody = buf;
        },
      }),
    );

    // Setup webhook endpoint
    this.setupWebhook();
  }

  private setupWebhook(): void {
    const path = this.config.path || '/webhook';

    // Add health check endpoint
    this.app.get('/health', (_, res) => {
      res.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    this.app.post(
      path,
      async (req: express.Request & { rawBody?: Buffer }, res: express.Response) => {
        try {
          // Verify webhook signature
          if (!this.verifySignature(req)) {
            logger.warn('Invalid webhook signature');
            return res.status(401).send('Invalid signature');
          }

          // Get the event type
          const event = req.headers['x-github-event'];
          logger.info(`Received GitHub event: ${event}`);

          if (event === 'ping') {
            return res.status(200).send('pong');
          }

          // Handle pull request events
          if (event === 'pull_request') {
            const payload = req.body;
            await this.handlePullRequestEvent(payload);
          }

          // Handle PR review comment events
          if (event === 'pull_request_review_comment') {
            const payload = req.body;
            await this.handlePRReviewCommentEvent(payload);
          }

          res.status(200).send('Webhook processed');
        } catch (error) {
          logger.error('Error processing webhook:', error);
          res.status(500).send('Error processing webhook');
        }
      },
    );
  }

  private verifySignature(req: express.Request & { rawBody?: Buffer }): boolean {
    // Get the signature header and ensure it's defined.
    const signatureHeader = req.headers['x-hub-signature-256'];
    if (!signatureHeader || !req.rawBody) {
      return false;
    }

    // If signatureHeader is an array, take the first element.
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    const hmac = createHmac('sha256', this.config.secret);
    const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');

    try {
      // Convert both strings to Buffer for secure comparison
      const signatureBuffer = Buffer.from(signature, 'utf8');
      const digestBuffer = Buffer.from(digest, 'utf8');

      // Ensure buffers are the same length before comparison
      if (signatureBuffer.length !== digestBuffer.length) {
        return false;
      }

      // Use timing-safe comparison to prevent timing attacks
      return timingSafeEqual(signatureBuffer, digestBuffer);
    } catch (error) {
      logger.error('Error verifying signature:', error);
      return false;
    }
  }

  private async handlePullRequestEvent(payload: {
    action: string;
    number: number;
    repository: {
      owner: { login: string };
      name: string;
    };
  }): Promise<void> {
    // Check if it's an opened or synchronized PR
    if (['opened', 'synchronize', 'reopened'].includes(payload.action)) {
      const {
        number: prNumber,
        repository: {
          owner: { login: owner },
          name: repo,
        },
      } = payload;

      logger.info(`Processing PR #${prNumber} in ${owner}/${repo}`);

      try {
        // Review the PR
        const review = await this.reviewerService.reviewPullRequest(owner, repo, prNumber);
        logger.info(`Generated review with ${review.comments.length} comments for PR #${prNumber}`);

        // Submit the review
        await this.reviewerService.submitReview(owner, repo, prNumber, review);
        logger.info(`Submitted review for PR #${prNumber}`);

        // Generate tests for modified files if needed
        if (process.env.AUTO_GENERATE_TESTS === 'true') {
          await this.generateTestsForPR(owner, repo, prNumber, payload);
        }
      } catch (error) {
        logger.error(`Error processing PR #${prNumber}:`, error);
      }
    }
  }

  private async generateTestsForPR(
    owner: string,
    repo: string,
    prNumber: number,
    _payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Get list of modified files
      const pr = await this.reviewerService.githubService.getPullRequest(owner, repo, prNumber);
      const files = await this.reviewerService.githubService.getPullRequestFiles(
        owner,
        repo,
        prNumber,
      );

      // Filter to only include code files that might need tests (could be more specific based on your needs)
      const codeFiles = files.filter(
        (file) =>
          !file.filename.includes('test.') &&
          !file.filename.includes('spec.') &&
          (file.filename.endsWith('.ts') || file.filename.endsWith('.js')),
      );

      for (const file of codeFiles) {
        try {
          logger.info(`Generating tests for ${file.filename}`);
          const testCode = await this.reviewerService.generateTests(
            file.filename,
            owner,
            repo,
            pr.head.ref,
          );

          // Here you could:
          // 1. Create a file in the PR branch with the tests
          // 2. Create a comment on the PR with the tests
          // 3. Submit the tests as a PR comment

          // Example: Add as a comment
          const comment = `## Generated Tests for \`${file.filename}\`\n\`\`\`typescript\n${testCode}\n\`\`\``;
          // Create a comment with the generated tests
          await this.reviewerService.githubService.createReview(
            owner,
            repo,
            prNumber,
            pr.head.sha,
            `Generated tests for ${file.filename}`,
            'COMMENT',
            [
              {
                path: file.filename,
                position: 1, // Position (could be more specific)
                body: comment,
              },
            ],
          );

          logger.info(`Added test comment for ${file.filename}`);
        } catch (error) {
          logger.error(`Error generating tests for ${file.filename}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Error in generateTestsForPR:`, error);
    }
  }

  /**
   * Handle PR review comment events
   */
  private async handlePRReviewCommentEvent(payload: {
    action: string;
    comment: {
      id: number;
      user: { login: string };
      body: string;
      path: string;
      position?: number;
      line?: number;
      created_at: string;
      updated_at: string;
      html_url: string;
      in_reply_to_id?: number;
    };
    pull_request: { number: number };
    repository: {
      owner: { login: string };
      name: string;
    };
  }): Promise<void> {
    try {
      if (payload.comment && payload.action === 'created') {
        const {
          pull_request: { number: prNumber },
          repository: {
            owner: { login: owner },
            name: repo,
          },
          comment,
        } = payload;

        logger.info(`Received review comment on PR #${prNumber} in ${owner}/${repo}`);

        // Convert to our internal ReviewComment type
        const reviewComment = {
          id: comment.id,
          user: {
            login: comment.user.login,
          },
          body: comment.body,
          path: comment.path,
          position: comment.position,
          line: comment.line,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          html_url: comment.html_url,
          in_reply_to_id: comment.in_reply_to_id,
        };

        // Process the comment (check if it's a reply to our bot and respond if needed)
        await this.reviewerService.handleCommentResponse(owner, repo, prNumber, reviewComment);
      }
    } catch (error) {
      logger.error('Error handling PR review comment event:', error);
    }
  }

  /**
   * Start the webhook server
   */
  start(): void {
    this.app.listen(this.config.port, () => {
      logger.info(`Webhook server running on port ${this.config.port}`);
    });
  }
}
