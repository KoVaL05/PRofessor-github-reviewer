# PRofessor 👨‍🏫

AI-powered GitHub code reviewer that provides insightful feedback on pull requests using Claude's powerful language models.

## Features

- Automatically reviews GitHub pull requests
- Analyzes code for best practices, potential bugs, and security issues
- Provides suggestions for code improvements
- Integrates directly with GitHub's review system
- Generates test files for new functionality
- Tracks API requests with promptfoo for cost monitoring and analytics
- Responds interactively to developer replies
- Runs as a server with GitHub webhook integration
- Deploys easily with Docker

## Installation

### Local Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/github-reviewer.git
cd github-reviewer

# Install dependencies
npm install

# Build the project
npm run build
```

### Docker Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/github-reviewer.git
cd github-reviewer

# Create .env file
cp .env.example .env
# Edit the .env file with your configuration

# Build and start the Docker container
docker-compose up -d
```

## Configuration

Copy the `.env.example` file to `.env` and fill in your GitHub and Claude API tokens:

```bash
cp .env.example .env
```

Edit the `.env` file:

```
# GitHub configuration
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=optional_default_owner
GITHUB_REPO=optional_default_repo
PR_NUMBER=optional_default_pr_number

# Claude API configuration
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_MODEL=claude-3-haiku-20240307
CLAUDE_MAX_TOKENS=1000
CLAUDE_TEMPERATURE=0.7

# Test configuration
TEST_FRAMEWORK=jest
AUTO_GENERATE_TESTS=false

# Server configuration
PORT=3000
WEBHOOK_SECRET=your_webhook_secret_here
WEBHOOK_PATH=/webhook

# Logging and debugging
DEBUG=false
VERBOSE=false

# Run mode
DRY_RUN=false

# Test generation
OUTPUT_FILE=optional_output_file_path
```

## Usage

### Server Mode with GitHub Webhooks

```bash
# Start the server (development)
npm run dev

# Start the server (production)
npm run build
npm run server:prod

# Or with Docker
docker-compose up -d
```

#### GitHub Webhook Setup

1. In your GitHub repository, go to Settings > Webhooks > Add webhook
2. Set the Payload URL to `https://your-server.com/webhook` (or your custom path)
3. Set Content type to `application/json`
4. Set Secret to the same value as `WEBHOOK_SECRET` in your .env file
5. Choose which events to trigger the webhook. For PR reviews, select "Pull requests" and "Issue comments" (for interactive responses)
6. Click "Add webhook"

### CLI Usage

#### Reviewing Pull Requests

```bash
# Review a specific PR
npm run review-pr owner repo pr_number

# Or set environment variables
export GITHUB_OWNER=owner
export GITHUB_REPO=repo
export PR_NUMBER=123
npm run review-pr

# Run in dry-run mode (doesn't submit the review)
export DRY_RUN=true
npm run review-pr owner repo pr_number
```

#### Generating Tests

```bash
# Generate tests for a specific file
npm run generate-tests owner repo path/to/file.ts branch

# Output to a file instead of console
export OUTPUT_FILE=./tests/generated/mytest.test.ts
npm run generate-tests owner repo path/to/file.ts
```

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

## Architecture

- **GithubService**: Handles all GitHub API interactions (PRs, files, comments)
- **ClaudeService**: Manages Claude API requests for code review and test generation
- **CodeReviewerService**: Orchestrates the review process between GitHub and Claude
- **WebhookService**: Handles GitHub webhook events for automated PR reviews
- **Logger**: Utility for tracking and debugging
- **PromptFoo Integration**: Collects API request metrics for cost tracking and performance analysis

## Health Checks

The server provides a `/health` endpoint that returns the current status, timestamp, and uptime information. This is useful for monitoring and container orchestration systems.

## License

MIT