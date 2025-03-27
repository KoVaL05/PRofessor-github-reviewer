import dotenv from 'dotenv';
import { GithubService } from './services/github';
import { CodeReviewerService } from './services/reviewer';

// Load environment variables
dotenv.config();

async function main() {
  // Check for required environment variables
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  // Get owner and repo from environment variables or command line arguments
  const owner = process.env.GITHUB_OWNER || process.argv[2];
  const repo = process.env.GITHUB_REPO || process.argv[3];
  const prNumber = parseInt(process.env.PR_NUMBER || process.argv[4], 10);

  if (!owner || !repo || isNaN(prNumber)) {
    console.error('Usage: npm start <owner> <repo> <pr-number>');
    console.error('Or set GITHUB_OWNER, GITHUB_REPO, and PR_NUMBER environment variables');
    process.exit(1);
  }

  console.log(`Reviewing PR #${prNumber} in ${owner}/${repo}...`);

  // Initialize services
  const githubService = new GithubService({ token });
  const reviewerService = new CodeReviewerService(githubService);

  try {
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
  } catch (error) {
    console.error('Error reviewing PR:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
