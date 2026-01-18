/**
 * Lark API Client
 *
 * @description Client for interacting with Lark Open API (Base operations)
 */

import type {
  LarkConfig,
  LarkTokenResponse,
  LarkApiResponse,
  LarkBase,
  LarkTable,
  LarkField,
  LarkRecord,
  LarkListResponse,
} from '../types/index.js';

const DEFAULT_BASE_URL = 'https://open.larksuite.com/open-apis';

export class LarkApiClient {
  private config: LarkConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private userAccessToken: string | null = null;

  constructor(config: LarkConfig, userAccessToken?: string) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    };
    this.userAccessToken = userAccessToken || null;
  }

  /**
   * Set user access token for user-context API calls
   */
  setUserAccessToken(token: string): void {
    this.userAccessToken = token;
  }

  /**
   * Get tenant access token
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    const response = await fetch(
      `${this.config.baseUrl}/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      }
    );

    const data = (await response.json()) as LarkTokenResponse;

    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`Failed to get access token: ${data.msg}`);
    }

    this.accessToken = data.tenant_access_token;
    this.tokenExpiry = Date.now() + data.expire * 1000;

    return this.accessToken;
  }

  /**
   * Make authenticated API request
   * Uses user_access_token if available, otherwise falls back to tenant_access_token
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<LarkApiResponse<T>> {
    // Use user token if available (for user-specific resources like their Bases)
    // Otherwise use tenant token (for app-level operations)
    const token = this.userAccessToken || (await this.getAccessToken());

    // Add timeout to prevent hanging requests (10 seconds for faster feedback)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle non-OK HTTP status before parsing JSON
      if (!response.ok) {
        const textBody = await response.text();
        console.error('HTTP Error:', {
          status: response.status,
          statusText: response.statusText,
          path: path,
          body: textBody.substring(0, 200),
        });
        throw new Error(`HTTP Error: ${response.status} ${response.statusText} for ${path}`);
      }

      // Parse JSON with error handling
      let data: LarkApiResponse<T>;
      try {
        data = (await response.json()) as LarkApiResponse<T>;
      } catch (parseError) {
        console.error('JSON Parse Error:', {
          path: path,
          error: (parseError as Error).message,
        });
        throw new Error(`Invalid JSON response for ${path}: ${(parseError as Error).message}`);
      }

      if (data.code !== 0) {
        console.error('API Error Details:', {
          code: data.code,
          msg: data.msg,
          path: path,
          hasUserToken: !!this.userAccessToken,
        });
        throw new Error(`API Error: ${data.msg} (code: ${data.code})`);
      }

      return data;
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Request timeout: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Parse Base URL to extract app_token
   * @example https://xxx.larksuite.com/base/xxxxx -> xxxxx
   * @example https://xxx.larksuite.com/wiki/xxxxx?table=... -> xxxxx
   */
  parseBaseUrl(url: string): string {
    const patterns = [
      /\/base\/([a-zA-Z0-9]+)/,           // Standard format
      /app_token=([a-zA-Z0-9]+)/,         // Query parameter
      /\/bitable\/([a-zA-Z0-9]+)/,        // Bitable format
      /\/wiki\/([a-zA-Z0-9]+)/,           // Wiki embedded Base
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    throw new Error(`Invalid Base URL format: ${url}`);
  }

  /**
   * Extract table ID from URL if present
   * @example ?table=tblXXXX -> tblXXXX
   */
  parseTableIdFromUrl(url: string): string | null {
    const match = url.match(/[?&]table=([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get Base (App) information
   */
  async getBase(appToken: string): Promise<LarkBase> {
    const response = await this.request<{ app: LarkBase }>(
      'GET',
      `/bitable/v1/apps/${appToken}`
    );

    return response.data!.app;
  }

  /**
   * Create a new Base
   */
  async createBase(name: string, folderToken?: string): Promise<LarkBase> {
    const body: Record<string, string> = { name };
    if (folderToken) {
      body.folder_token = folderToken;
    }

    const response = await this.request<{ app: LarkBase }>(
      'POST',
      '/bitable/v1/apps',
      body
    );

    return response.data!.app;
  }

  /**
   * List all tables in a Base
   */
  async listTables(appToken: string): Promise<LarkTable[]> {
    const tables: LarkTable[] = [];
    let pageToken: string | undefined;

    do {
      const path = pageToken
        ? `/bitable/v1/apps/${appToken}/tables?page_token=${pageToken}`
        : `/bitable/v1/apps/${appToken}/tables`;

      const response = await this.request<LarkListResponse<LarkTable>>(
        'GET',
        path
      );

      if (response.data?.items) {
        tables.push(...response.data.items);
      }

      pageToken = response.data?.page_token;
    } while (pageToken);

    return tables;
  }

  /**
   * Get a specific table by ID
   * Used as fallback when listTables fails due to Advanced Permissions
   */
  async getTable(appToken: string, tableId: string): Promise<LarkTable | null> {
    try {
      const response = await this.request<{ table: LarkTable }>(
        'GET',
        `/bitable/v1/apps/${appToken}/tables/${tableId}`
      );
      return response.data!.table;
    } catch (error) {
      console.log('getTable error:', (error as Error).message);
      // If we can't get the table info, create a minimal table object
      // This allows us to at least try to access the table's data
      return {
        table_id: tableId,
        name: `Table ${tableId}`,
        revision: 0,
      };
    }
  }

  /**
   * Try to list tables, fallback to specific table if permission denied
   * Advanced Permissions on Base may block listTables but allow accessing specific tables
   */
  async listTablesWithFallback(appToken: string, tableIdFromUrl?: string | null): Promise<LarkTable[]> {
    try {
      return await this.listTables(appToken);
    } catch (error) {
      const errMsg = (error as Error).message;
      // If listTables fails and we have a table ID from URL, create a minimal table object
      if (tableIdFromUrl && (errMsg.includes('1254002') || errMsg.includes('permission') || errMsg.includes('Fail'))) {
        console.log(`listTables failed (Advanced Permissions?), using table ID from URL: ${tableIdFromUrl}`);
        // Return a minimal table object - we'll try to access fields/records directly
        const table = await this.getTable(appToken, tableIdFromUrl);
        if (table) {
          return [table];
        }
      }
      throw error;
    }
  }

  /**
   * Create a table in a Base
   */
  async createTable(
    appToken: string,
    name: string,
    fields: Partial<LarkField>[]
  ): Promise<LarkTable> {
    console.log(`Creating table: ${name} with ${fields.length} fields`);

    const response = await this.request<{ table_id?: string; table?: LarkTable }>(
      'POST',
      `/bitable/v1/apps/${appToken}/tables`,
      {
        table: {
          name,
          default_view_name: 'Grid View',
          fields: fields.map((f) => ({
            field_name: f.field_name,
            type: f.type,
            ui_type: f.ui_type,
            property: f.property,
          })),
        },
      }
    );

    console.log('createTable response:', JSON.stringify(response.data));

    // Handle different response structures
    if (response.data?.table) {
      return response.data.table;
    }

    // Some API versions return table_id directly
    if (response.data?.table_id) {
      return {
        table_id: response.data.table_id,
        name: name,
        revision: 0,
      };
    }

    throw new Error('createTable: No table data in response');
  }

  /**
   * Delete a table from a Base
   */
  async deleteTable(appToken: string, tableId: string): Promise<void> {
    console.log(`Deleting table: ${tableId}`);
    await this.request('DELETE', `/bitable/v1/apps/${appToken}/tables/${tableId}`);
    console.log(`Deleted table: ${tableId}`);
  }

  /**
   * List all fields in a table
   * Includes safeguard against infinite pagination loops
   */
  async listFields(appToken: string, tableId: string): Promise<LarkField[]> {
    const fields: LarkField[] = [];
    let pageToken: string | undefined;
    let prevPageToken: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 10; // Safeguard against infinite loops

    do {
      const path = pageToken
        ? `/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_token=${pageToken}`
        : `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;

      console.log(`listFields request: page ${pageCount + 1}, path: ${path}`);

      const response = await this.request<LarkListResponse<LarkField>>(
        'GET',
        path
      );

      if (response.data?.items) {
        fields.push(...response.data.items);
        console.log(`listFields got ${response.data.items.length} fields (total: ${fields.length})`);
      }

      prevPageToken = pageToken;
      pageToken = response.data?.page_token;
      pageCount++;

      // Stop if same page_token is returned (API bug or end of data)
      if (pageToken && pageToken === prevPageToken) {
        console.log('listFields: same page_token returned, stopping pagination');
        break;
      }

      // Safeguard: prevent infinite loops
      if (pageCount >= MAX_PAGES) {
        console.warn(`listFields: reached max pages (${MAX_PAGES}), stopping pagination`);
        break;
      }
    } while (pageToken);

    return fields;
  }

  /**
   * List fields with graceful fallback for Advanced Permissions
   * Returns empty array if permission denied, allowing preview to continue
   */
  async listFieldsWithFallback(appToken: string, tableId: string): Promise<LarkField[]> {
    try {
      return await this.listFields(appToken, tableId);
    } catch (error) {
      const errMsg = (error as Error).message;
      console.log(`listFields failed for ${tableId}: ${errMsg}`);

      // If blocked by Advanced Permissions or timeout, return empty array
      if (errMsg.includes('1254002') || errMsg.includes('permission') ||
          errMsg.includes('Fail') || errMsg.includes('timeout')) {
        console.log('listFields blocked by Advanced Permissions, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Create a field in a table
   */
  async createField(
    appToken: string,
    tableId: string,
    field: Partial<LarkField>
  ): Promise<LarkField> {
    const response = await this.request<{ field: LarkField }>(
      'POST',
      `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      {
        field_name: field.field_name,
        type: field.type,
        ui_type: field.ui_type,
        property: field.property,
      }
    );

    return response.data!.field;
  }

  /**
   * List all records in a table
   */
  async listRecords(appToken: string, tableId: string): Promise<LarkRecord[]> {
    const records: LarkRecord[] = [];
    let pageToken: string | undefined;
    let prevPageToken: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 100; // Allow more pages for records

    do {
      const path = pageToken
        ? `/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_token=${pageToken}`
        : `/bitable/v1/apps/${appToken}/tables/${tableId}/records`;

      console.log(`listRecords request: page ${pageCount + 1}`);

      const response = await this.request<LarkListResponse<LarkRecord>>(
        'GET',
        path
      );

      if (response.data?.items) {
        records.push(...response.data.items);
        console.log(`listRecords got ${response.data.items.length} records (total: ${records.length})`);
      }

      prevPageToken = pageToken;
      pageToken = response.data?.page_token;
      pageCount++;

      // Stop if same page_token is returned
      if (pageToken && pageToken === prevPageToken) {
        console.log('listRecords: same page_token returned, stopping pagination');
        break;
      }

      if (pageCount >= MAX_PAGES) {
        console.warn(`listRecords: reached max pages (${MAX_PAGES}), stopping pagination`);
        break;
      }
    } while (pageToken);

    return records;
  }

  /**
   * List records with fallback for Advanced Permissions
   */
  async listRecordsWithFallback(appToken: string, tableId: string): Promise<LarkRecord[]> {
    try {
      return await this.listRecords(appToken, tableId);
    } catch (error) {
      const errMsg = (error as Error).message;
      console.log(`listRecords failed for ${tableId}: ${errMsg}`);

      // If blocked by Advanced Permissions, return empty array
      if (errMsg.includes('1254002') || errMsg.includes('permission') ||
          errMsg.includes('Fail') || errMsg.includes('timeout')) {
        console.log('listRecords blocked by Advanced Permissions, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Create records in a table (batch)
   */
  async createRecords(
    appToken: string,
    tableId: string,
    records: Array<{ fields: Record<string, unknown> }>
  ): Promise<LarkRecord[]> {
    // Lark API has a limit of 500 records per request
    const BATCH_SIZE = 500;
    const createdRecords: LarkRecord[] = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      const response = await this.request<{ records: LarkRecord[] }>(
        'POST',
        `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
        { records: batch }
      );

      if (response.data?.records) {
        createdRecords.push(...response.data.records);
      }
    }

    return createdRecords;
  }

  /**
   * Add collaborator with permission
   * Note: This feature may not be available for all Base types
   */
  async addCollaborator(
    appToken: string,
    userId: string,
    permissionType: 'view' | 'edit' | 'full_access' = 'full_access'
  ): Promise<void> {
    if (!userId) {
      console.log('addCollaborator: No user ID provided, skipping');
      return;
    }

    try {
      // Try the standard collaborator API
      await this.request(
        'POST',
        `/drive/v1/permissions/${appToken}/members`,
        {
          member_type: 'user',
          member_id: userId,
          perm: permissionType === 'full_access' ? 'full_access' : permissionType,
        }
      );
      console.log('addCollaborator: Successfully added collaborator');
    } catch (error) {
      // Collaborator API might not be available for Bitable
      console.log('addCollaborator failed (may not be supported):', (error as Error).message);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<{ user_id: string; name: string }> {
    try {
      const response = await this.request<{
        user_id?: string;
        open_id?: string;
        name?: string;
        en_name?: string;
      }>('GET', '/authen/v1/user_info');

      // Handle different response structures from Lark API
      const data = response.data;
      if (!data) {
        throw new Error('No user data in response');
      }

      return {
        user_id: data.user_id || data.open_id || '',
        name: data.name || data.en_name || '',
      };
    } catch (error) {
      console.log('getCurrentUser failed:', (error as Error).message);
      // Return empty user info - grant permission will fail gracefully
      return { user_id: '', name: '' };
    }
  }

  /**
   * Get Wiki node information to extract Base app_token
   * Wiki pages can embed Bitable (Base), and this API retrieves the actual Base token
   */
  async getWikiNodeInfo(nodeToken: string): Promise<{
    obj_token: string;
    obj_type: string;
    title: string;
  }> {
    const response = await this.request<{
      node: {
        obj_token: string;
        obj_type: string;
        title: string;
        space_id: string;
        node_token: string;
      };
    }>('GET', `/wiki/v2/spaces/get_node?token=${nodeToken}`);

    return response.data!.node;
  }

  /**
   * Download attachment file by file_token
   * Returns the file as a Buffer
   */
  async downloadAttachment(fileToken: string): Promise<{ buffer: Buffer; contentType: string }> {
    const token = this.userAccessToken || (await this.getAccessToken());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout for downloads

    try {
      const response = await fetch(
        `${this.config.baseUrl}/drive/v1/medias/${fileToken}/download`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
      };
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Download timeout for file: ${fileToken}`);
      }
      throw error;
    }
  }

  /**
   * Upload attachment to a Bitable record
   * Requires: appToken, tableId, recordId, fieldName, file data
   * Returns the new file_token
   */
  async uploadAttachment(
    appToken: string,
    tableId: string,
    recordId: string,
    fieldName: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<string> {
    const token = this.userAccessToken || (await this.getAccessToken());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for uploads

    try {
      // Create form data for multipart upload
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: contentType });
      formData.append('file', blob, fileName);
      formData.append('file_name', fileName);

      const response = await fetch(
        `${this.config.baseUrl}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}/fields/${encodeURIComponent(fieldName)}/value`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to upload attachment: ${response.status} ${text.substring(0, 200)}`);
      }

      const data = (await response.json()) as {
        code: number;
        msg?: string;
        data?: { file_token?: string };
      };

      if (data.code !== 0) {
        throw new Error(`Upload API Error: ${data.msg || 'Unknown error'} (code: ${data.code})`);
      }

      // Return the new file_token from the response
      return data.data?.file_token || '';
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Upload timeout for file: ${fileName}`);
      }
      throw error;
    }
  }

  /**
   * Update a record's field value
   */
  async updateRecordField(
    appToken: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    await this.request(
      'PUT',
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
      { fields }
    );
  }

  /**
   * Resolve URL to get Base app_token
   * Handles both direct Base URLs and Wiki-embedded Base URLs
   */
  async resolveBaseAppToken(url: string): Promise<string> {
    // Check if it's a Wiki URL
    const wikiMatch = url.match(/\/wiki\/([a-zA-Z0-9]+)/);
    if (wikiMatch) {
      const nodeToken = wikiMatch[1];
      try {
        const nodeInfo = await this.getWikiNodeInfo(nodeToken);
        console.log('Wiki node info:', JSON.stringify(nodeInfo, null, 2));

        if (nodeInfo.obj_type === 'bitable' || nodeInfo.obj_type === 'base') {
          console.log('Using obj_token as Base app_token:', nodeInfo.obj_token);
          return nodeInfo.obj_token;
        }

        // If obj_type is different, it might be a shortcut or reference
        console.log(`Wiki node type is "${nodeInfo.obj_type}", obj_token: ${nodeInfo.obj_token}`);
        return nodeInfo.obj_token;
      } catch (error) {
        // Fall back to parsing the URL directly
        console.log('Wiki API failed, falling back to URL parsing:', error);
      }
    }

    // Try standard URL parsing
    return this.parseBaseUrl(url);
  }
}

export default LarkApiClient;
