import { OpenAI } from '@openai/openai';
import { ModelConfig, ApiRequest, ApiResponse, CodeReview, CodeBaseConfig } from '../../types';
import { logger } from '../../utils/logger';
import { ProviderService } from '../provider_service';

export class ChatGPTService extends ProviderService {
  private client: OpenAI;
  private config: ModelConfig;
  private codeBaseConfig: CodeBaseConfig;

  constructor(config: ModelConfig, codeBaseConfig: CodeBaseConfig) {
    super();
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.config = config;
    this.codeBaseConfig = codeBaseConfig;
  }

  /**
   * Send a request to ChatGPT API and track it
   */
  async generateResponse(
    prompt: string,
    options: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> = {},
  ): Promise<ApiResponse> {
    const requestTime = new Date();

    try {
      const defaultOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: this.config.model!,
        max_tokens: this.config.maxTokens!,
        temperature: this.config.temperature!,
        messages: [{ role: 'user', content: prompt }],
      };

      const mergedOptions = { ...defaultOptions, ...options };

      // Only override messages if not provided in options
      if (options.messages) {
        mergedOptions.messages = options.messages;
      }

      const response = await this.client.chat.completions.create(mergedOptions);

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

      // Calculate token usage and cost
      // Cast the response to access usage property
      const messageResponse = response as OpenAI.Chat.Completions.ChatCompletion;
      if (messageResponse && 'usage' in messageResponse && messageResponse.usage) {
        request.inputTokens = messageResponse.usage.prompt_tokens;
        request.outputTokens = messageResponse.usage.completion_tokens;
        request.totalTokens =
          messageResponse.usage.prompt_tokens + messageResponse.usage.completion_tokens;

        // Calculate cost if pricing is configured
        if (this.config.pricing && this.config.pricing[mergedOptions.model as string]) {
          const pricing = this.config.pricing[mergedOptions.model as string];
          const inputCost =
            (messageResponse.usage.prompt_tokens / 1000) * pricing.inputCostPer1kTokens;
          const outputCost =
            (messageResponse.usage.completion_tokens / 1000) * pricing.outputCostPer1kTokens;
          request.cost = inputCost + outputCost;
        }
      }

      this.requests.push(request);

      await this.logRequest(request);

      // Extract text from OpenAI Chat Completions
      if (
        response &&
        response.choices &&
        Array.isArray(response.choices) &&
        response.choices.length > 0
      ) {
        const message = response.choices[0].message;
        if (message && message.content) {
          return {
            content: message.content,
            rawResponse: response,
            success: true,
          };
        }
      }

      throw new Error('Unexpected response format from ChatGPT API');
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
   * Log API request analytics
   */
  async logRequest(request: ApiRequest): Promise<void> {
    if (!this.config.trackingEnabled) {
      return;
    }

    const status = request.success ? 'SUCCESS' : 'ERROR';
    const model = (request.options.model as string) || 'unknown';
    const tokensInfo = request.totalTokens
      ? `(${request.inputTokens} in / ${request.outputTokens} out)`
      : '';
    const costInfo = request.cost ? `$${request.cost.toFixed(4)}` : '';

    // Log to the application logger
    logger.logApiCall('ChatGPTService', `request-${model}`, request.latency, status, {
      model,
      promptLength: request.prompt.length,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      totalTokens: request.totalTokens,
      cost: request.cost,
      timestamp: request.timestamp,
    });

    // Log a summary for quick analysis
    if (request.success) {
      logger.info(
        `ChatGPT API ${model} ${status} in ${request.latency}ms ${tokensInfo} ${costInfo}`,
        { prompt: request.prompt.substring(0, 100) + '...' },
      );
    } else {
      logger.error(
        `ChatGPT API ${model} ${status} in ${request.latency}ms: ${request.error?.message}`,
        { prompt: request.prompt.substring(0, 100) + '...' },
      );
    }
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
      const jsonString = this.extractJsonFromMarkdown(response.content);
      if (jsonString) {
        return JSON.parse(jsonString) as CodeReview;
      } else {
        throw new Error('Could not extract JSON from the response');
      }
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
