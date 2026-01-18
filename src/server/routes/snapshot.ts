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

    const { sourceBaseUrl, targetBaseName, grantAdminPermission, preserveAttachments, selectedTableIds } = req.body;

    if (!sourceBaseUrl || !targetBaseName) {
      return res.status(400).json({
        error: 'Missing required fields: sourceBaseUrl, targetBaseName',
      });
    }

    const appId = process.env.LARK_APP_ID!;
    const appSecret = process.env.LARK_APP_SECRET!;

    // Pass user access token to access user's Bases
    const snapshotService = new SnapshotService({ appId, appSecret }, tokens.accessToken);

    const config: SnapshotConfig = {
      sourceBaseUrl,
      targetBaseName,
      grantAdminPermission: grantAdminPermission ?? true,
      preserveAttachments: preserveAttachments ?? false,
      selectedTableIds: selectedTableIds || undefined,
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

    // Use LarkApiClient with user access token for accessing user's Bases
    const { LarkApiClient } = await import('../../services/larkApiClient.js');
    const client = new LarkApiClient({ appId, appSecret }, tokens.accessToken);

    // Resolve URL to get app_token (handles Wiki URLs)
    const appToken = await client.resolveBaseAppToken(sourceBaseUrl);
    const tableIdFromUrl = client.parseTableIdFromUrl(sourceBaseUrl);
    console.log('Resolved app_token:', appToken, 'tableIdFromUrl:', tableIdFromUrl);

    let base;
    try {
      base = await client.getBase(appToken);
      console.log('getBase succeeded:', base.name);
    } catch (error) {
      console.log('getBase failed:', (error as Error).message);
      throw error;
    }

    // Try listTables, fallback to specific table if Advanced Permissions block it
    let tables;
    try {
      tables = await client.listTablesWithFallback(appToken, tableIdFromUrl);
      console.log('listTables succeeded:', tables.length, 'tables');
    } catch (error) {
      console.log('listTables failed:', (error as Error).message);
      throw error;
    }

    // Get field counts for each table (use fallback method for Advanced Permissions)
    console.log('Getting fields for', tables.length, 'tables...');
    const tableInfo = await Promise.all(
      tables.map(async (table) => {
        console.log('Getting fields for table:', table.table_id, table.name);
        // Use listFieldsWithFallback to gracefully handle Advanced Permissions
        const fields = await client.listFieldsWithFallback(appToken, table.table_id);
        console.log('Got', fields.length, 'fields for', table.name);
        const dynamicFields = fields.filter((f) =>
          ['SingleLink', 'DuplexLink', 'Lookup', 'Formula', 'User'].includes(f.ui_type)
        );
        return {
          name: table.name,
          tableId: table.table_id,
          fieldCount: fields.length,
          dynamicFieldCount: dynamicFields.length,
        };
      })
    );
    console.log('Table info gathered:', tableInfo.length);

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
