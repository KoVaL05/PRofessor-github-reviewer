// ProviderService.ts
import { ApiRequest, ApiResponse, CodeReview } from '../types/index';

export abstract class ProviderService {
  protected requests: ApiRequest[] = [];

  /**
   * Send a request to the provider's API.
   */
  abstract generateResponse(
    prompt: string,
    options?: Record<string, unknown>,
  ): Promise<ApiResponse>;

  /**
   * Log the API request analytics.
   */
  abstract logRequest(request: ApiRequest): Promise<void>;

  /**
   * Generate a review for a pull request.
   */
  abstract reviewPullRequest(
    files: Array<{ filename: string; content: string; patch?: string }>,
  ): Promise<CodeReview>;

  /**
   * Generate tests for code.
   */
  abstract generateTests(filePath: string, fileContent: string): Promise<string>;

  /**
   * Generate a response to a user comment on a review.
   */
  abstract respondToComment(userComment: string, codeContext?: string): Promise<string>;

  /**
   * Extract JSON from Markdown text.
   */

  extractJsonFromMarkdown(markdownString: string): string {
    if (!markdownString) {
      return '';
    }
    let result = markdownString.replace(/^```json\s*/m, '');
    result = result.replace(/\s*```$/m, '');

    return result;
  }

  /**
   * Get all tracked API requests.
   */
  getRequests(): ApiRequest[] {
    return this.requests;
  }

  /**
   * Clear all tracked API requests.
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Get usage analytics for a time period
   */
  getUsageAnalytics(
    startDate?: Date,
    endDate?: Date,
  ): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    averageLatency: number;
    requestsByModel: Record<string, number>;
  } {
    // Filter requests by date range if provided
    let filteredRequests = this.requests;
    if (startDate) {
      filteredRequests = filteredRequests.filter((r) => r.timestamp >= startDate);
    }
    if (endDate) {
      filteredRequests = filteredRequests.filter((r) => r.timestamp <= endDate);
    }

    // Count requests by model
    const requestsByModel: Record<string, number> = {};
    filteredRequests.forEach((request) => {
      const model = (request.options.model as string) || 'unknown';
      requestsByModel[model] = (requestsByModel[model] || 0) + 1;
    });

    // Calculate stats
    const successfulRequests = filteredRequests.filter((r) => r.success);
    const totalTokens = filteredRequests.reduce((sum, r) => sum + (r.totalTokens || 0), 0);
    const inputTokens = filteredRequests.reduce((sum, r) => sum + (r.inputTokens || 0), 0);
    const outputTokens = filteredRequests.reduce((sum, r) => sum + (r.outputTokens || 0), 0);
    const totalCost = filteredRequests.reduce((sum, r) => sum + (r.cost || 0), 0);
    const totalLatency = filteredRequests.reduce((sum, r) => sum + r.latency, 0);
    const averageLatency = filteredRequests.length > 0 ? totalLatency / filteredRequests.length : 0;

    return {
      totalRequests: filteredRequests.length,
      successfulRequests: successfulRequests.length,
      failedRequests: filteredRequests.length - successfulRequests.length,
      totalTokens,
      inputTokens,
      outputTokens,
      totalCost,
      averageLatency,
      requestsByModel,
    };
  }

  /**
   * Get cost breakdown by model
   */
  getCostBreakdown(): Record<string, { requests: number; tokens: number; cost: number }> {
    const breakdown: Record<string, { requests: number; tokens: number; cost: number }> = {};

    this.requests.forEach((request) => {
      const model = (request.options.model as string) || 'unknown';

      if (!breakdown[model]) {
        breakdown[model] = { requests: 0, tokens: 0, cost: 0 };
      }

      breakdown[model].requests += 1;
      breakdown[model].tokens += request.totalTokens || 0;
      breakdown[model].cost += request.cost || 0;
    });

    return breakdown;
  }
}
