import { Octokit } from '@octokit/rest';
import { GithubConfig, PullRequest, PullRequestFile, ReviewComment } from '../types';

export class GithubService {
  private octokit: Octokit;
  private owner?: string;
  private repo?: string;
  private botUsername?: string;

  constructor(config: GithubConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.owner;
    this.repo = config.repo;
    this.botUsername = config.botUsername;
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return data as PullRequest;
  }

  async getPullRequestFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PullRequestFile[]> {
    const { data } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    return data as PullRequestFile[];
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in data && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    throw new Error(`Could not get content for ${path}`);
  }

  async createReviewComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    commitId: string,
    path: string,
    position: number,
  ): Promise<void> {
    await this.octokit.pulls.createReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      body,
      commit_id: commitId,
      path,
      position,
    });
  }

  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    commitId: string,
    body: string,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    comments: Array<{
      path: string;
      position: number;
      body: string;
    }>,
  ): Promise<void> {
    await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitId,
      body,
      event,
      comments,
    });
  }

  async getReviewComments(owner: string, repo: string, prNumber: number): Promise<ReviewComment[]> {
    const { data } = await this.octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
    });

    return data as ReviewComment[];
  }

  async createReplyComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    commentId: number,
  ): Promise<void> {
    await this.octokit.pulls.createReplyForReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      body,
      comment_id: commentId,
    });
  }

  isBotComment(comment: ReviewComment): boolean {
    return comment.user?.login === this.botUsername;
  }
}
