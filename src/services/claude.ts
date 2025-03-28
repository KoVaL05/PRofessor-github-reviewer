import { Anthropic } from '@anthropic-ai/sdk';
import * as promptfoo from 'promptfoo';
import { ClaudeConfig, ApiRequest, ApiResponse, CodeReview, CodeBaseConfig } from '../types';

export class ClaudeService {
  private client: Anthropic;
  private requests: ApiRequest[] = [];
  private config: ClaudeConfig;
  private codeBaseConfig: CodeBaseConfig;

  constructor(config: ClaudeConfig, codeBaseConfig: CodeBaseConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.config = config;
    this.codeBaseConfig = codeBaseConfig;
  }

  /**
   * Send a request to Claude API and track it
   */
  async generateResponse(
    prompt: string,
    options: Partial<Anthropic.Messages.MessageCreateParams> = {},
  ): Promise<ApiResponse> {
    const requestTime = new Date();

    try {
      const defaultOptions: Anthropic.Messages.MessageCreateParams = {
        model: this.config.model || 'claude-3-haiku-20240307',
        max_tokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7,
        messages: [{ role: 'user', content: prompt }],
      };

      const mergedOptions = { ...defaultOptions, ...options };

      // Only override messages if not provided in options
      if (options.messages) {
        mergedOptions.messages = options.messages;
      }

      const response = await this.client.messages.create(mergedOptions);

      const responseTime = new Date();
      const latency = responseTime.getTime() - requestTime.getTime();

      // Track the request
      const request: ApiRequest = {
        timestamp: requestTime,
        prompt: prompt,
        options: mergedOptions,
        response: response,
        latency: latency,
        success: true,
      };

      this.requests.push(request);

      await this.logToPromptfoo(request);

      // Handle both regular responses and stream responses
      if ('content' in response && Array.isArray(response.content) && response.content.length > 0) {
        const block = response.content[0];
        if ('type' in block && block.type === 'text' && 'text' in block) {
          return {
            content: block.text,
            rawResponse: response,
            success: true,
          };
        }
      }
      throw new Error('Unexpected response format from Claude API');
    } catch (error) {
      const responseTime = new Date();
      const latency = responseTime.getTime() - requestTime.getTime();

      // Track the failed request
      const request: ApiRequest = {
        timestamp: requestTime,
        prompt: prompt,
        options: options as Record<string, unknown>,
        error: error instanceof Error ? error : new Error(String(error)),
        latency: latency,
        success: false,
      };

      this.requests.push(request);

      return {
        content: '',
        error: error instanceof Error ? error : new Error(String(error)),
        success: false,
      };
    }
  }

  /**
   * Log a request to promptfoo for analytics
   */
  private async logToPromptfoo(request: ApiRequest): Promise<void> {
    try {
      // Access options safely with type checking
      const options = request.options as Record<string, unknown>;
      const model = options.model as string | undefined;
      const temperature = options.temperature as number | undefined;
      const maxTokens = options.max_tokens as number | undefined;
      await promptfoo.evaluate({
        prompts: [request.prompt],
        providers: [
          {
            id: model,
            config: {
              temperature: temperature,
              maxTokens: maxTokens,
            },
          },
        ],
        metadata: {
          latencyMs: request.latency,
          success: request.success,
          timestamp: request.timestamp.toISOString(),
        },
      });
    } catch (error) {
      console.error('Error logging to promptfoo:', error);
    }
  }

  /**
   * Get all tracked API requests
   */
  getRequests(): ApiRequest[] {
    return this.requests;
  }

  /**
   * Clear tracked API requests
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Generate review for a pull request
   */
  async reviewPullRequest(
    files: Array<{ filename: string; content: string; patch?: string }>,
  ): Promise<CodeReview> {
    const filesContent = files
      .map((file) => {
        return `### ${file.filename}\n\`\`\`\n${file.content}\n\`\`\`\n${file.patch ? `Patch: ${file.patch}` : ''}`;
      })
      .join('\n\n');

    const prompt = `You are an experienced senior software engineer with over 15 years of experience in ${this.codeBaseConfig.language} development. Your role is to review the following ${this.codeBaseConfig.language} code as if you were performing a detailed code review for a production-level project. Please evaluate the code for the following aspects:

    Code quality and readability

    Adherence to best practices and coding standards

    Performance and efficiency

    Error handling and robustness

    Security vulnerabilities

    Maintainability and scalability

Provide a detailed critique of the code along with actionable suggestions for improvement. If applicable, include alternative code snippets or refactoring ideas to enhance overall quality.

The code to review is below:
${filesContent}

Provide your review in JSON format with these fields:
1. comments: Array of objects with fields "path" (string), "body" (string), and "position" (number, optional)
2. summary: Overall review summary
3. approved: boolean indicating if the PR can be approved`;

    const response = await this.generateResponse(prompt);

    if (!response.success) {
      throw new Error('Failed to generate PR review: ' + response.error?.message);
    }

    try {
      return JSON.parse(response.content) as CodeReview;
    } catch (error) {
      throw new Error(
        'Failed to parse response as JSON: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /**
   * Generate tests for code
   */
  async generateTests(filePath: string, fileContent: string): Promise<string> {
    const prompt = `You are a senior programmer your only job is to generate test cases for the following code file. Use the ${this.codeBaseConfig.frameworkInfo} testing framework.

Filename: ${filePath}

Code:
\`\`\`
${fileContent}
\`\`\`

Return only the test code without explanations.`;

    const response = await this.generateResponse(prompt);

    if (!response.success) {
      throw new Error('Failed to generate tests: ' + response.error?.message);
    }

    return response.content;
  }

  /**
   * Generate a response to a user comment on a review
   */
  async respondToComment(userComment: string, codeContext?: string): Promise<string> {
    let prompt = `You are an AI code reviewer assistant. A developer has replied to one of your code review comments. 
Please provide a helpful and constructive response. Be concise, friendly, and focus on helping the developer.

The developer's comment:
"""
${userComment}
"""`;

    if (codeContext) {
      prompt += `\n\nHere is the code context for this discussion:
\`\`\`
${codeContext}
\`\`\``;
    }

    prompt += `\n\nRespond to the developer in a helpful, professional manner. Provide clear explanations, code examples if needed, and maintain a collaborative tone.`;

    const response = await this.generateResponse(prompt);

    if (!response.success) {
      throw new Error('Failed to generate comment response: ' + response.error?.message);
    }

    return response.content;
  }
}
