export interface GithubConfig {
  token: string;
  owner?: string;
  repo?: string;
  botUsername?: string;
}

export interface ModelConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  pricing?: {
    [key: string]: {
      inputCostPer1kTokens: number;
      outputCostPer1kTokens: number;
    };
  };
  trackingEnabled?: boolean;
}

export interface CodeBaseConfig {
  language: string;
  frameworkInfo: string;
}

export interface ApiRequest {
  timestamp: Date;
  prompt: string;
  options: Record<string, unknown>;
  response?: unknown;
  error?: Error;
  latency: number;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
}

export interface ApiResponse {
  content: string;
  rawResponse?: unknown;
  error?: Error;
  success: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  user: {
    login: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch?: string;
}

export interface ReviewComment {
  id?: number;
  body: string;
  path: string;
  position?: number | null;
  line?: number;
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
  side?: 'LEFT' | 'RIGHT';
  user?: {
    login: string;
  };
  created_at?: string;
  updated_at?: string;
  html_url?: string;
  in_reply_to_id?: number;
}

export interface CodeReview {
  comments: ReviewComment[];
  summary: string;
  approved: boolean;
}
