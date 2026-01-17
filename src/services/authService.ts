/**
 * Lark OAuth2 Authentication Service
 *
 * @description Handles OAuth2 authentication with Lark Open Platform
 */

import type { LarkConfig, LarkTokenResponse } from '../types/index.js';

const LARK_OAUTH_URL = 'https://open.larksuite.com/open-apis/authen/v1';
const LARK_AUTH_URL = 'https://open.larksuite.com/open-apis/auth/v3';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  userName: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user?: {
    id: string;
    name: string;
  };
  expiresAt?: number;
}

// In-memory token storage (replace with Redis/DB in production)
const tokenStore = new Map<string, OAuthTokens>();

export class AuthService {
  private config: LarkConfig;
  private redirectUri: string;

  constructor(config: LarkConfig, redirectUri: string) {
    this.config = config;
    this.redirectUri = redirectUri;
  }

  /**
   * Get OAuth2 authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      app_id: this.config.appId,
      redirect_uri: this.redirectUri,
      state,
    });

    return `${LARK_OAUTH_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    // First, get app access token
    const appTokenRes = await fetch(
      `${LARK_AUTH_URL}/app_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      }
    );

    const appTokenData = (await appTokenRes.json()) as LarkTokenResponse;
    if (appTokenData.code !== 0 || !appTokenData.tenant_access_token) {
      throw new Error(`Failed to get app token: ${appTokenData.msg}`);
    }

    // Then, exchange code for user access token
    const userTokenRes = await fetch(
      `${LARK_OAUTH_URL}/access_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appTokenData.tenant_access_token}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
        }),
      }
    );

    interface UserTokenResponse {
      code: number;
      msg: string;
      data?: {
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
        refresh_expires_in: number;
        scope: string;
        open_id: string;
        union_id: string;
        user_id: string;
        name: string;
        en_name: string;
        avatar_url: string;
      };
    }

    const userTokenData = (await userTokenRes.json()) as UserTokenResponse;
    if (userTokenData.code !== 0 || !userTokenData.data) {
      throw new Error(`Failed to get user token: ${userTokenData.msg}`);
    }

    const tokens: OAuthTokens = {
      accessToken: userTokenData.data.access_token,
      refreshToken: userTokenData.data.refresh_token,
      expiresAt: Date.now() + userTokenData.data.expires_in * 1000,
      userId: userTokenData.data.user_id || userTokenData.data.open_id,
      userName: userTokenData.data.name || userTokenData.data.en_name,
    };

    return tokens;
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    // Get app access token first
    const appTokenRes = await fetch(
      `${LARK_AUTH_URL}/app_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      }
    );

    const appTokenData = (await appTokenRes.json()) as LarkTokenResponse;
    if (appTokenData.code !== 0 || !appTokenData.tenant_access_token) {
      throw new Error(`Failed to get app token: ${appTokenData.msg}`);
    }

    // Refresh user token
    const refreshRes = await fetch(
      `${LARK_OAUTH_URL}/refresh_access_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appTokenData.tenant_access_token}`,
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      }
    );

    interface RefreshResponse {
      code: number;
      msg: string;
      data?: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
      };
    }

    const refreshData = (await refreshRes.json()) as RefreshResponse;
    if (refreshData.code !== 0 || !refreshData.data) {
      throw new Error(`Failed to refresh token: ${refreshData.msg}`);
    }

    return {
      accessToken: refreshData.data.access_token,
      refreshToken: refreshData.data.refresh_token,
      expiresAt: Date.now() + refreshData.data.expires_in * 1000,
      userId: '',
      userName: '',
    };
  }

  /**
   * Store tokens for a session
   */
  storeTokens(sessionId: string, tokens: OAuthTokens): void {
    tokenStore.set(sessionId, tokens);
  }

  /**
   * Get tokens for a session
   */
  getTokens(sessionId: string): OAuthTokens | undefined {
    return tokenStore.get(sessionId);
  }

  /**
   * Remove tokens for a session
   */
  removeTokens(sessionId: string): void {
    tokenStore.delete(sessionId);
  }

  /**
   * Get authentication state
   */
  getAuthState(sessionId: string): AuthState {
    const tokens = tokenStore.get(sessionId);

    if (!tokens) {
      return { isAuthenticated: false };
    }

    // Check if token is expired
    if (Date.now() >= tokens.expiresAt) {
      return { isAuthenticated: false };
    }

    return {
      isAuthenticated: true,
      user: {
        id: tokens.userId,
        name: tokens.userName,
      },
      expiresAt: tokens.expiresAt,
    };
  }
}

export default AuthService;
