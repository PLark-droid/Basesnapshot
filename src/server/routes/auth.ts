/**
 * Authentication Routes
 *
 * @description OAuth2 authentication endpoints
 */

import { Router } from 'express';
import { AuthService } from '../../services/authService.js';
import crypto from 'crypto';

const router = Router();

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

// Store for OAuth state validation
const stateStore = new Map<string, { createdAt: number; sessionId: string }>();

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

    // Store state for validation
    stateStore.set(state, { createdAt: Date.now(), sessionId });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of stateStore.entries()) {
      if (value.createdAt < tenMinutesAgo) {
        stateStore.delete(key);
      }
    }

    const authUrl = authService.getAuthorizationUrl(state);

    // Set session cookie
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

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

    // Validate state
    const storedState = stateStore.get(state);
    if (!storedState) {
      return res.status(400).json({ error: 'Invalid state' });
    }
    stateStore.delete(state);

    const authService = getAuthService();

    // Exchange code for tokens
    const tokens = await authService.exchangeCodeForTokens(code);

    // Store tokens
    authService.storeTokens(storedState.sessionId, tokens);

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
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      return res.json({ isAuthenticated: false });
    }

    const authService = getAuthService();
    const authState = authService.getAuthState(sessionId);

    res.json(authState);
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
    const sessionId = req.cookies?.session_id;

    if (sessionId) {
      const authService = getAuthService();
      authService.removeTokens(sessionId);
    }

    res.clearCookie('session_id');
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export { router as authRouter };
