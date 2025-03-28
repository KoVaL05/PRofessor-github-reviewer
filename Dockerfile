FROM node:20-alpine

WORKDIR /app

# Install curl for health checks
RUN apk --no-cache add curl

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build application
RUN npm run build

# Create logs directory
RUN mkdir -p /app/logs

# Set environment variables
ENV NODE_ENV=production

# Run the application
CMD ["node", "dist/index.js", "server"]