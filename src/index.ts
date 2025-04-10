import dotenv from 'dotenv';
import { GithubService } from './services/github';
import { CodeReviewerService } from './services/reviewer';
// SERVICES
import { ClaudeService } from './services/models/claude';
import { ChatGPTService } from './services/models/chatgpt';
import { GeminiService } from './services/models/gemini';

import { WebhookService } from './services/webhook';
import { logger } from './utils/logger';
import { CodeBaseConfig, ModelConfig } from './types';
import { ProviderService } from './services/provider_service';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  // Check for required environment variables
  const githubToken = process.env.GITHUB_TOKEN;
  const providerApiKey = process.env.CLAUDE_API_KEY;

  if (!githubToken) {
    logger.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!providerApiKey) {
    logger.error('PROVIDER_API_KEY environment variable is required');
    process.exit(1);
  }

  // Get command from arguments
  const command = process.argv[2];

  // Initialize services
  const githubService = new GithubService({
    token: githubToken,
    botUsername: 'PRofessor',
  });

  const modelConfig: ModelConfig = {
    apiKey: providerApiKey,
    model: process.env.PROVIDER_MODEL || 'claude-3-7-sonnet-latest',
    maxTokens: process.env.PROVIDER_MAX_TOKENS
      ? parseInt(process.env.PROVIDER_MAX_TOKENS, 10)
      : 1000,
    temperature: process.env.PROVIDER_TEMPERATURE
      ? parseFloat(process.env.PROVIDER_TEMPERATURE)
      : 0.7,
  };
  const codeBaseConfig: CodeBaseConfig = {
    language: 'TypeScript',
    frameworkInfo: process.env.TEST_FRAMEWORK || 'jest',
  };
  const providerService: ProviderService = (() => {
    switch (process.env.PROVIDER_NAME) {
      case 'Claude':
        return new ClaudeService(modelConfig, codeBaseConfig);
      case 'ChatGPT':
        return new ChatGPTService(modelConfig, codeBaseConfig);
      case 'Gemini':
        return new GeminiService(modelConfig, codeBaseConfig);
      default:
        throw new Error('Unsupported provider');
    }
  })();

  const reviewerService = new CodeReviewerService(githubService, providerService);

  try {
    if (command === 'server') {
      // Run in server mode with webhook listener
      await startServer(reviewerService);
    } else if (command === 'review-pr') {
      await handleReviewPr(reviewerService);
    } else if (command === 'generate-tests') {
      await handleGenerateTests(reviewerService);
    } else {
      logger.error('Unknown command. Available commands: server, review-pr, generate-tests');
      logger.error('Usage:');
      logger.error('  server:        npm start server');
      logger.error('  review-pr:     npm start review-pr <owner> <repo> <pr-number>');
      logger.error(
        '  generate-tests: npm start generate-tests <owner> <repo> <file-path> <branch>',
      );
      process.exit(1);
    }
  } catch (error) {
    logger.error('Error executing command:', error);
    process.exit(1);
  }
}

async function startServer(reviewerService: CodeReviewerService): Promise<void> {
  // Get webhook configuration
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const webhookPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const webhookPath = process.env.WEBHOOK_PATH || '/webhook';

  if (!webhookSecret) {
    logger.error('WEBHOOK_SECRET environment variable is required for server mode');
    process.exit(1);
  }

  // Start webhook server
  logger.info(`Starting webhook server on port ${webhookPort}...`);
  const webhookService = new WebhookService(reviewerService, {
    port: webhookPort,
    secret: webhookSecret,
    path: webhookPath,
  });

  webhookService.start();
  logger.info('Webhook server started successfully');
}

async function handleReviewPr(reviewerService: CodeReviewerService): Promise<void> {
  // Get owner and repo from environment variables or command line arguments
  const owner = process.env.GITHUB_OWNER || process.argv[3];
  const repo = process.env.GITHUB_REPO || process.argv[4];
  const prNumber = parseInt(process.env.PR_NUMBER || process.argv[5], 10);

  if (!owner || !repo || isNaN(prNumber)) {
    console.error('Usage: npm start review-pr <owner> <repo> <pr-number>');
    console.error('Or set GITHUB_OWNER, GITHUB_REPO, and PR_NUMBER environment variables');
    process.exit(1);
  }

  console.log(`Reviewing PR #${prNumber} in ${owner}/${repo}...`);

  // Review the PR
  const review = await reviewerService.reviewPullRequest(owner, repo, prNumber);
  console.log(`Generated review with ${review.comments.length} comments`);

  // Submit the review if not in dry run mode
  if (process.env.DRY_RUN !== 'true') {
    await reviewerService.submitReview(owner, repo, prNumber, review);
    console.log('Review submitted successfully!');
  } else {
    console.log('Dry run mode - review not submitted');
    console.log('Summary:', review.summary);
    console.log('Comments:', JSON.stringify(review.comments, null, 2));
  }
}

async function handleGenerateTests(reviewerService: CodeReviewerService): Promise<void> {
  const owner = process.env.GITHUB_OWNER || process.argv[3];
  const repo = process.env.GITHUB_REPO || process.argv[4];
  const filePath = process.argv[5];
  const branch = process.argv[6] || 'main';

  if (!owner || !repo || !filePath) {
    console.error('Usage: npm start generate-tests <owner> <repo> <file-path> [branch]');
    console.error('Or set GITHUB_OWNER, GITHUB_REPO environment variables');
    process.exit(1);
  }

  console.log(`Generating tests for ${filePath} in ${owner}/${repo} (${branch})...`);

  try {
    const testCode = await reviewerService.generateTests(filePath, owner, repo, branch);

    // Output to console or file based on options
    if (process.env.OUTPUT_FILE) {
      const fs = require('fs');
      const path = require('path');
      const outputPath = path.resolve(process.env.OUTPUT_FILE);
      fs.writeFileSync(outputPath, testCode);
      console.log(`Tests written to ${outputPath}`);
    } else {
      console.log('\n--- Generated Tests ---\n');
      console.log(testCode);
      console.log('\n-----------------------\n');
    }
  } catch (error) {
    console.error('Error generating tests:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
