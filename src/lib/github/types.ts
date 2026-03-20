export interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    avatar_url: string;
    type: string;
  };
  repositories_count: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  clone_url: string;
  description: string | null;
  language: string | null;
  default_branch: string;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
  installationId: number;
}
