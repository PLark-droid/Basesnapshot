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

  constructor(config: LarkConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    };
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
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<LarkApiResponse<T>> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as LarkApiResponse<T>;

    if (data.code !== 0) {
      throw new Error(`API Error: ${data.msg} (code: ${data.code})`);
    }

    return data;
  }

  /**
   * Parse Base URL to extract app_token
   * @example https://xxx.larksuite.com/base/xxxxx -> xxxxx
   */
  parseBaseUrl(url: string): string {
    const patterns = [
      /\/base\/([a-zA-Z0-9]+)/,           // Standard format
      /app_token=([a-zA-Z0-9]+)/,         // Query parameter
      /bitable\/([a-zA-Z0-9]+)/,          // Bitable format
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
   * Create a table in a Base
   */
  async createTable(
    appToken: string,
    name: string,
    fields: Partial<LarkField>[]
  ): Promise<LarkTable> {
    const response = await this.request<{ table: LarkTable }>(
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

    return response.data!.table;
  }

  /**
   * List all fields in a table
   */
  async listFields(appToken: string, tableId: string): Promise<LarkField[]> {
    const fields: LarkField[] = [];
    let pageToken: string | undefined;

    do {
      const path = pageToken
        ? `/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_token=${pageToken}`
        : `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;

      const response = await this.request<LarkListResponse<LarkField>>(
        'GET',
        path
      );

      if (response.data?.items) {
        fields.push(...response.data.items);
      }

      pageToken = response.data?.page_token;
    } while (pageToken);

    return fields;
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

    do {
      const path = pageToken
        ? `/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_token=${pageToken}`
        : `/bitable/v1/apps/${appToken}/tables/${tableId}/records`;

      const response = await this.request<LarkListResponse<LarkRecord>>(
        'GET',
        path
      );

      if (response.data?.items) {
        records.push(...response.data.items);
      }

      pageToken = response.data?.page_token;
    } while (pageToken);

    return records;
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
   */
  async addCollaborator(
    appToken: string,
    userId: string,
    permissionType: 'view' | 'edit' | 'full_access' = 'full_access'
  ): Promise<void> {
    await this.request(
      'POST',
      `/bitable/v1/apps/${appToken}/roles/members`,
      {
        member_list: [
          {
            member_id: userId,
            member_type: 'user',
            permission: permissionType,
          },
        ],
      }
    );
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<{ user_id: string; name: string }> {
    const response = await this.request<{
      user: { user_id: string; name: string };
    }>('GET', '/authen/v1/user_info');

    return response.data!.user;
  }
}

export default LarkApiClient;
