# Deployment Guide

This guide covers how to deploy the GitHub Reviewer bot to a server using Docker.

## Prerequisites

- A server with Docker and Docker Compose installed
- A GitHub personal access token with repo permissions
- An Anthropic Claude API key
- A public-facing domain or IP address for GitHub webhooks
- (Optional) A reverse proxy like Nginx for SSL termination

## Deployment Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/github-reviewer.git
cd github-reviewer
```

### 2. Configure Environment Variables

Create a `.env` file based on the example:

```bash
cp .env.example .env
```

Edit the `.env` file with your specific configuration:

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

### 3. Start the Application with Docker Compose

```bash
docker-compose up -d
```

The application will be accessible at the configured port (default: 3000).

### 4. Configure GitHub Webhook

1. In your GitHub repository, go to Settings > Webhooks > Add webhook
2. Set the Payload URL to `https://your-server.com/webhook` (or your custom path)
3. Set Content type to `application/json`
4. Set Secret to the same value as `WEBHOOK_SECRET` in your .env file
5. Choose which events to trigger the webhook. For PR reviews, select "Pull requests" and "Issue comments" (for interactive responses)
6. Click "Add webhook"

### 5. Test the Webhook

Create a test pull request to verify that the bot is receiving events and generating reviews.

## Server Configuration

### Nginx Reverse Proxy (Recommended)

If you're using Nginx as a reverse proxy for SSL termination:

```nginx
server {
    listen 443 ssl;
    server_name your-server.com;

    ssl_certificate /path/to/certificate.pem;
    ssl_certificate_key /path/to/key.pem;

    location /webhook {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://localhost:3000;
    }
}
```

### Firewall Configuration

Make sure to allow traffic to the appropriate ports:

```bash
# If using Nginx (allow HTTP/HTTPS)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If exposing the application directly
sudo ufw allow 3000/tcp
```

## Monitoring and Logging

### Health Endpoint

The service provides a health check endpoint at `/health` that returns the service status, timestamp, and uptime. This is useful for monitoring tools and container orchestration systems.

Example health check response:
```json
{
  "status": "ok",
  "timestamp": "2024-03-28T10:15:30.123Z",
  "uptime": 1234.56
}
```

### View Logs

```bash
# View logs from Docker
docker-compose logs -f

# View logs directly from the container
docker logs -f github-reviewer
```

### Check Service Status

```bash
# Check if the container is running
docker-compose ps

# Check the health endpoint
curl http://localhost:3000/health
```

### Logging Configuration

You can configure the logging verbosity using the environment variables:
- `DEBUG=true` - Enable debug-level logs 
- `VERBOSE=true` - Include detailed metadata in logs

## Updating the Service

To update to a new version:

```bash
# Pull the latest code
git pull

# Restart the service
docker-compose down
docker-compose up -d --build
```

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check GitHub webhook settings and delivery logs
   - Verify your server is accessible from the internet
   - Ensure the webhook secret matches

2. **Reviews not being submitted**
   - Check the logs for API errors
   - Verify the GitHub token has sufficient permissions
   - Make sure the Claude API key is correct

3. **Docker container not starting**
   - Check environment variables
   - Verify there are no port conflicts
   - Ensure Docker has enough resources