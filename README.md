# PRofessor 👨‍🏫

AI-powered GitHub code reviewer that provides insightful feedback on pull requests.

## Features

- Automatically reviews GitHub pull requests
- Analyzes code for best practices, potential bugs, and security issues
- Provides suggestions for code improvements
- Integrates directly with GitHub's review system

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/professor.git
cd professor

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Copy the `.env.example` file to `.env` and fill in your GitHub token:

```bash
cp .env.example .env
```

Edit the `.env` file:

```
GITHUB_TOKEN=your_github_token_here
```

## Usage

```bash
# Review a specific PR
npm start owner repo pr_number

# Or set environment variables
export GITHUB_OWNER=owner
export GITHUB_REPO=repo
export PR_NUMBER=123
npm start

# Run in dry-run mode (doesn't submit the review)
export DRY_RUN=true
npm start owner repo pr_number
```

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## License

MIT
