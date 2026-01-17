/**
 * Snapshot Routes
 *
 * @description API endpoints for creating snapshots
 */

import { Router } from 'express';
import { SnapshotService } from '../../services/snapshotService.js';
import { AuthService } from '../../services/authService.js';
import type { SnapshotConfig } from '../../types/index.js';

const router = Router();

// Get auth service instance
const getAuthService = () => {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';

  if (!appId || !appSecret) {
    throw new Error('LARK_APP_ID and LARK_APP_SECRET must be set');
  }

  return new AuthService({ appId, appSecret }, redirectUri);
};

/**
 * POST /api/snapshot
 * Create a new snapshot
 */
router.post('/', async (req, res) => {
  try {
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const authService = getAuthService();
    const tokens = authService.getTokens(sessionId);

    if (!tokens) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Check if token is expired
    if (Date.now() >= tokens.expiresAt) {
      return res.status(401).json({ error: 'Token expired' });
    }

    const { sourceBaseUrl, targetBaseName, grantAdminPermission } = req.body;

    if (!sourceBaseUrl || !targetBaseName) {
      return res.status(400).json({
        error: 'Missing required fields: sourceBaseUrl, targetBaseName',
      });
    }

    const appId = process.env.LARK_APP_ID!;
    const appSecret = process.env.LARK_APP_SECRET!;

    const snapshotService = new SnapshotService({ appId, appSecret });

    const config: SnapshotConfig = {
      sourceBaseUrl,
      targetBaseName,
      grantAdminPermission: grantAdminPermission ?? true,
    };

    const result = await snapshotService.createSnapshot(config);

    res.json(result);
  } catch (error) {
    console.error('Snapshot error:', error);
    res.status(500).json({
      error: 'Failed to create snapshot',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/snapshot/preview
 * Preview snapshot (get source base info without creating)
 */
router.post('/preview', async (req, res) => {
  try {
    const sessionId = req.cookies?.session_id;

    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const authService = getAuthService();
    const tokens = authService.getTokens(sessionId);

    if (!tokens) {
      return res.status(401).json({ error: 'Session expired' });
    }

    const { sourceBaseUrl } = req.body;

    if (!sourceBaseUrl) {
      return res.status(400).json({ error: 'Missing sourceBaseUrl' });
    }

    const appId = process.env.LARK_APP_ID!;
    const appSecret = process.env.LARK_APP_SECRET!;

    // Use LarkApiClient to get base info
    const { LarkApiClient } = await import('../../services/larkApiClient.js');
    const client = new LarkApiClient({ appId, appSecret });

    const appToken = client.parseBaseUrl(sourceBaseUrl);
    const base = await client.getBase(appToken);
    const tables = await client.listTables(appToken);

    // Get field counts for each table
    const tableInfo = await Promise.all(
      tables.map(async (table) => {
        const fields = await client.listFields(appToken, table.table_id);
        const dynamicFields = fields.filter((f) =>
          ['SingleLink', 'DuplexLink', 'Lookup', 'Formula', 'User'].includes(f.ui_type)
        );
        return {
          name: table.name,
          fieldCount: fields.length,
          dynamicFieldCount: dynamicFields.length,
        };
      })
    );

    res.json({
      base: {
        name: base.name,
        appToken: base.app_token,
      },
      tables: tableInfo,
      totalTables: tables.length,
      totalDynamicFields: tableInfo.reduce((sum, t) => sum + t.dynamicFieldCount, 0),
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({
      error: 'Failed to preview source base',
      message: (error as Error).message,
    });
  }
});

export { router as snapshotRouter };
