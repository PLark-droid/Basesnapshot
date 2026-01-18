/**
 * Authentication Routes
 *
 * @description OAuth2 authentication endpoints
 * @note Uses cookie-based session storage for serverless compatibility
 */

import { Router } from 'express';
import { AuthService, type OAuthTokens } from '../../services/authService.js';
import crypto from 'crypto';

const router = Router();

// Check if running in serverless environment
const IS_SERVERLESS = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Cookie names
const AUTH_COOKIE = 'lark_auth';
const STATE_COOKIE = 'oauth_state';

// Initialize auth service
const getAuthService = () => {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';

  if (!appId || !appSecret) {
    throw new Error('LARK_APP_ID and LARK_APP_SECRET must be set');
  }

  return new AuthService({ appId, appSecret }, redirectUri);
};

// Store for OAuth state validation (used only in non-serverless)
const stateStore = new Map<string, { createdAt: number; sessionId: string }>();

// Helper: Encode tokens for cookie storage
function encodeTokens(tokens: OAuthTokens): string {
  return Buffer.from(JSON.stringify(tokens)).toString('base64');
}

// Helper: Decode tokens from cookie
function decodeTokens(encoded: string): OAuthTokens | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * GET /api/auth/login
 * Start OAuth login flow
 */
router.get('/login', (req, res) => {
  try {
    const authService = getAuthService();

    // Generate session ID and state
    const sessionId = crypto.randomUUID();
    const state = crypto.randomBytes(16).toString('hex');

    if (IS_SERVERLESS) {
      // In serverless: store state in cookie
      res.cookie(STATE_COOKIE, JSON.stringify({ state, sessionId, createdAt: Date.now() }), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
      });
    } else {
      // In development: use in-memory store
      stateStore.set(state, { createdAt: Date.now(), sessionId });

      // Clean up old states (older than 10 minutes)
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      for (const [key, value] of stateStore.entries()) {
        if (value.createdAt < tenMinutesAgo) {
          stateStore.delete(key);
        }
      }
    }

    const authUrl = authService.getAuthorizationUrl(state);

    // Set session cookie (for development mode)
    if (!IS_SERVERLESS) {
      res.cookie('session_id', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }

    res.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to start login' });
  }
});

/**
 * GET /api/auth/callback
 * OAuth callback handler
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    let sessionId: string;

    if (IS_SERVERLESS) {
      // In serverless: validate state from cookie
      const stateCookie = req.cookies?.[STATE_COOKIE];
      if (!stateCookie) {
        return res.status(400).json({ error: 'Missing state cookie' });
      }

      try {
        const storedState = JSON.parse(stateCookie);
        if (storedState.state !== state) {
          return res.status(400).json({ error: 'Invalid state' });
        }
        // Check if state is expired (10 minutes)
        if (Date.now() - storedState.createdAt > 10 * 60 * 1000) {
          return res.status(400).json({ error: 'State expired' });
        }
        sessionId = storedState.sessionId;
      } catch {
        return res.status(400).json({ error: 'Invalid state cookie' });
      }

      // Clear state cookie
      res.clearCookie(STATE_COOKIE);
    } else {
      // In development: validate from in-memory store
      const storedState = stateStore.get(state);
      if (!storedState) {
        return res.status(400).json({ error: 'Invalid state' });
      }
      stateStore.delete(state);
      sessionId = storedState.sessionId;
    }

    const authService = getAuthService();

    // Exchange code for tokens
    const tokens = await authService.exchangeCodeForTokens(code);

    if (IS_SERVERLESS) {
      // In serverless: store tokens in cookie
      res.cookie(AUTH_COOKIE, encodeTokens(tokens), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    } else {
      // In development: store tokens in memory
      authService.storeTokens(sessionId, tokens);
    }

    // Redirect to client app
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}?login=success`);
  } catch (error) {
    console.error('Callback error:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}?login=error&message=${encodeURIComponent((error as Error).message)}`);
  }
});

/**
 * GET /api/auth/status
 * Check authentication status
 */
router.get('/status', (req, res) => {
  try {
    if (IS_SERVERLESS) {
      // In serverless: read tokens from cookie
      const authCookie = req.cookies?.[AUTH_COOKIE];
      if (!authCookie) {
        return res.json({ isAuthenticated: false });
      }

      const tokens = decodeTokens(authCookie);
      if (!tokens) {
        return res.json({ isAuthenticated: false });
      }

      // Check if token is expired
      if (Date.now() >= tokens.expiresAt) {
        return res.json({ isAuthenticated: false });
      }

      return res.json({
        isAuthenticated: true,
        user: {
          id: tokens.userId,
          name: tokens.userName,
        },
        expiresAt: tokens.expiresAt,
      });
    } else {
      // In development: check in-memory store
      const sessionId = req.cookies?.session_id;

      if (!sessionId) {
        return res.json({ isAuthenticated: false });
      }

      const authService = getAuthService();
      const authState = authService.getAuthState(sessionId);

      res.json(authState);
    }
  } catch (error) {
    console.error('Status error:', error);
    res.json({ isAuthenticated: false });
  }
});

/**
 * POST /api/auth/logout
 * Logout and clear session
 */
router.post('/logout', (req, res) => {
  try {
    if (IS_SERVERLESS) {
      // In serverless: just clear the auth cookie
      res.clearCookie(AUTH_COOKIE);
    } else {
      // In development: remove from memory and clear session cookie
      const sessionId = req.cookies?.session_id;

      if (sessionId) {
        const authService = getAuthService();
        authService.removeTokens(sessionId);
      }

      res.clearCookie('session_id');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export { router as authRouter };
