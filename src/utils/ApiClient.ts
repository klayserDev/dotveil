import axios, { AxiosInstance } from 'axios';

export interface User {
  id: string;
  email: string;
  githubId: string;
  publicKey: string | null;
  encryptedPrivateKey: string | null;
  salt: string | null;
  iv: string | null;
}

export interface AuthResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
}

export interface TokenResponse {
  accessToken: string;
  user: User;
}

/**
 * API Client for DotVeil Backend
 */
export class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor(baseURL: string = process.env.DOTVEIL_API_URL || 'https://dotveil.com') {
    this.client = axios.create({
      baseURL: `${baseURL}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  /**
   * Initiate GitHub OAuth device flow
   */
  async initiateAuth(): Promise<AuthResponse> {
    const response = await this.client.post('/auth/device');
    return response.data;
  }

  /**
   * Poll for auth completion
   */
  async pollAuth(deviceCode: string): Promise<TokenResponse> {
    const response = await this.client.post('/auth/poll', { deviceCode });
    return response.data;
  }

  /**
   * Get current user profile
   */
  async getMe(): Promise<User> {
    const response = await this.client.get('/users/me');
    return response.data;
  }

  /**
   * Update user vault (public key, encrypted private key, salt, iv)
   */
  async updateVault(data: {
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
    iv: string;
  }): Promise<User> {
    const response = await this.client.patch('/users/vault', data);
    return response.data;
  }

  /**
   * Create a new project
   */
  async createProject(name: string): Promise<any> {
    const response = await this.client.post('/projects', { name });
    return response.data;
  }

  /**
   * List user's projects
   */
  async listProjects(): Promise<any[]> {
    const response = await this.client.get('/projects');
    return response.data;
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<any> {
    const response = await this.client.delete(`/projects/${projectId}`);
    return response.data;
  }

  /**
   * Upload encrypted secrets
   */
  async uploadSecrets(projectId: string, environment: string, data: {
    encryptedData: string;
    iv: string;
    encryptedProjectKey: string;
    sha256: string;
    changes?: any;
  }): Promise<any> {
    const response = await this.client.post(`/projects/${projectId}/secrets`, {
      environment,
      ...data,
    });
    return response.data;
  }

  /**
   * Download encrypted secrets
   */
  async downloadSecrets(projectId: string, environment: string, options?: { purpose?: 'diff' }): Promise<{
    encryptedData: string;
    iv: string;
    encryptedProjectKey: string;
    sha256: string;
  }> {
    const config: any = {};
    if (options?.purpose === 'diff') {
      config.headers = { 'X-Action': 'diff' };
    }
    const response = await this.client.get(`/projects/${projectId}/secrets/${environment}`, config);
    return response.data;
  }

  /**
   * List environments
   */
  async listEnvironments(projectId: string): Promise<any[]> {
    const response = await this.client.get(`/projects/${projectId}/envs`);
    return response.data;
  }

  /**
   * Create environment
   */
  async createEnvironment(projectId: string, name: string): Promise<any> {
    const response = await this.client.post(`/projects/${projectId}/envs`, { name });
    return response.data;
  }

  /**
   * Delete environment
   */
  async deleteEnvironment(projectId: string, name: string): Promise<any> {
    const response = await this.client.delete(`/projects/${projectId}/envs/${name}`);
    return response.data;
  }

  /**
   * Update environment settings (RBAC)
   */
  async updateEnvironment(projectId: string, name: string, data: { allowedPushRoles?: string[], allowedPullRoles?: string[] }): Promise<any> {
    const response = await this.client.patch(`/projects/${projectId}/envs/${name}`, data);
    return response.data;
  }

  /**
   * Lookup user by email
   */
  async lookupUser(email: string): Promise<{ id: string; email: string; publicKey: string }> {
    const response = await this.client.get(`/users/lookup?email=${encodeURIComponent(email)}`);
    return response.data;
  }

  /**
   * Invite member to project
   */
  async inviteMember(projectId: string, email: string, role: string, encryptedProjectKey: string): Promise<any> {
    const response = await this.client.post(`/projects/${projectId}/invitations`, {
      email,
      role,
      encryptedProjectKey,
    });
    return response.data;
  }

  /**
   * List my pending invitations
   */
  async listMyInvitations(): Promise<any[]> {
    const response = await this.client.get('/users/me/invitations');
    return response.data;
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(token: string): Promise<any> {
    const response = await this.client.post(`/invitations/${token}/accept`);
    return response.data;
  }

  /**
   * Decline invitation
   */
  async declineInvitation(token: string): Promise<any> {
    const response = await this.client.post(`/invitations/${token}/decline`);
    return response.data;
  }

  /**
   * Remove member from project
   */
  async removeMember(projectId: string, email: string): Promise<any> {
    const response = await this.client.delete(`/projects/${projectId}/members`, {
      data: { email }
    });
    return response.data;
  }

  async getProjectKey(projectId: string) {
    const response = await this.client.get(`/projects/${projectId}/key`);
    return response.data;
  }

  /**
   * List project members
   */
  async listMembers(projectId: string): Promise<any[]> {
    const response = await this.client.get(`/projects/${projectId}/members`);
    return response.data;
  }

  /**
   * Update member role
   */
  async updateMemberRole(projectId: string, email: string, role: string): Promise<any> {
    const response = await this.client.patch(`/projects/${projectId}/members`, {
      email,
      role,
    });
    return response.data;
  }

  /**
   * Rotate project key
   */
  async rotateKey(projectId: string, data: {
    newEncryptedProjectKeys: Record<string, string>;
    reEncryptedSecrets: any[];
    reEncryptedVersions: any[];
  }): Promise<any> {
    const response = await this.client.post(`/projects/${projectId}/rotate-key`, data);
    return response.data;
  }

  /**
   * Get secret versions
   */
  async getSecretVersions(projectId: string, environment: string): Promise<any[]> {
    const response = await this.client.get(`/projects/${projectId}/secrets/${environment}/versions`);
    return response.data;
  }

  /**
   * Rollback secret to a specific version
   */
  async rollbackSecret(projectId: string, environment: string, versionId: string): Promise<any> {
    const response = await this.client.post(`/projects/${projectId}/secrets/${environment}/rollback`, {
      versionId,
    });
    return response.data;
  }
}
