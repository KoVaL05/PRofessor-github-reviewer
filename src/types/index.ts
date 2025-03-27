export interface GithubConfig {
  token: string;
  owner?: string;
  repo?: string;
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
  body: string;
  path: string;
  position?: number | null;
  line?: number;
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
  side?: 'LEFT' | 'RIGHT';
}

export interface CodeReview {
  comments: ReviewComment[];
  summary: string;
  approved: boolean;
}
