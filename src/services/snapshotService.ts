/**
 * Snapshot Service
 *
 * @description Service for creating static snapshots of Lark Base
 * Converts dynamic fields (lookup, relations) to static text/number values
 */

import { LarkApiClient } from './larkApiClient.js';
import type {
  LarkConfig,
  LarkField,
  LarkCellValue,
  LarkUserValue,
  LarkLinkValue,
  LarkAttachmentValue,
  LarkFieldType,
  SnapshotConfig,
  SnapshotResult,
  SnapshotError,
} from '../types/index.js';

/** Field types that need conversion to static values */
const DYNAMIC_FIELD_TYPES: LarkFieldType[] = [
  'SingleLink',
  'DuplexLink',
  'Lookup',
  'Formula',
  'User',
  'CreatedUser',
  'ModifiedUser',
  'Attachment',  // Attachments can't be copied, convert to file names
];

/** Field types that are not supported for table creation and need conversion */
const UNSUPPORTED_FIELD_TYPES: string[] = [
  'Rating',      // type 24 - not supported in createTable
  'Stage',       // type 24 - workflow stage field
  'Currency',    // type 1050 - not supported
  'Email',       // type 1051 - not supported
  'Location',    // type 22 - conflicts with Progress
  'Barcode',     // type 23 - may not be supported
  'Button',      // type 3001 - button field
  'AutoNumber',  // type 1005 - auto-generated, convert to Text
];

/** Field type numbers that are not supported for table creation */
const UNSUPPORTED_TYPE_NUMBERS: number[] = [
  // Dynamic field types (must be converted)
  11,    // User
  18,    // SingleLink
  19,    // Lookup
  20,    // Formula
  21,    // DuplexLink
  // System field types
  1001,  // CreatedTime
  1002,  // ModifiedTime
  1003,  // CreatedUser
  1004,  // ModifiedUser
  1005,  // AutoNumber
  // Other unsupported types
  24,    // Rating/Stage
  1050,  // Currency
  1051,  // Email
  22,    // Location (conflicts with Progress)
  23,    // Barcode
  3001,  // Button
];

/** Field type mapping for number type IDs */
const FIELD_TYPE_MAP: Record<LarkFieldType, number> = {
  Text: 1,
  Number: 2,
  SingleSelect: 3,
  MultiSelect: 4,
  DateTime: 5,
  Checkbox: 7,
  User: 11,
  Phone: 13,
  Url: 15,
  Attachment: 17,
  SingleLink: 18,
  DuplexLink: 21,
  Lookup: 19,
  Formula: 20,
  AutoNumber: 1005,
  CreatedTime: 1001,
  ModifiedTime: 1002,
  CreatedUser: 1003,
  ModifiedUser: 1004,
  Barcode: 23,
  Progress: 22,
  Currency: 1050,
  Rating: 24,
  Email: 1051,
  Location: 22,
};

export class SnapshotService {
  private client: LarkApiClient;
  private errors: SnapshotError[] = [];
  private fieldsConverted = 0;

  constructor(config: LarkConfig, userAccessToken?: string) {
    this.client = new LarkApiClient(config, userAccessToken);
  }

  /**
   * Generate date suffix in YYYYMMDD format
   */
  private getDateSuffix(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Delete the default "Table" that Lark creates when a new Base is created
   */
  private async deleteDefaultTable(appToken: string): Promise<void> {
    try {
      const tables = await this.client.listTables(appToken);
      // Find the default table (usually named "Table" or similar)
      const defaultTable = tables.find(
        (t) => t.name === 'Table' || t.name === 'テーブル' || t.name === '数据表'
      );

      if (defaultTable) {
        console.log(`Deleting default table: ${defaultTable.name} (${defaultTable.table_id})`);
        await this.client.deleteTable(appToken, defaultTable.table_id);
      }
    } catch (error) {
      // Non-critical error, log and continue
      console.log('Failed to delete default table:', (error as Error).message);
    }
  }

  /**
   * Create a static snapshot of a Lark Base
   */
  async createSnapshot(config: SnapshotConfig): Promise<SnapshotResult> {
    this.errors = [];
    this.fieldsConverted = 0;

    const startTime = new Date();

    try {
      // 1. Resolve source URL to get app_token (handles Wiki URLs)
      const sourceAppToken = await this.client.resolveBaseAppToken(config.sourceBaseUrl);
      const tableIdFromUrl = this.client.parseTableIdFromUrl(config.sourceBaseUrl);
      const sourceBase = await this.client.getBase(sourceAppToken);

      // 2. Create new target base
      const targetBase = await this.client.createBase(config.targetBaseName);

      // 3. Delete default "Table" that Lark creates automatically
      await this.deleteDefaultTable(targetBase.app_token);

      // 4. Get all tables from source (with fallback for Advanced Permissions)
      let sourceTables = await this.client.listTablesWithFallback(sourceAppToken, tableIdFromUrl);
      console.log(`Snapshot: Got ${sourceTables.length} tables available`);

      // Filter tables if specific selection provided
      if (config.selectedTableIds && config.selectedTableIds.length > 0) {
        sourceTables = sourceTables.filter(t => config.selectedTableIds!.includes(t.table_id));
        console.log(`Snapshot: Filtered to ${sourceTables.length} selected tables`);
      }

      // Generate date suffix for table names (YYYYMMDD)
      const dateSuffix = this.getDateSuffix();

      let totalRecordsProcessed = 0;

      // 5. Process each table
      for (const sourceTable of sourceTables) {
        try {
          const snapshotTableName = `${sourceTable.name}_snap_${dateSuffix}`;
          const recordsProcessed = await this.processTable(
            sourceAppToken,
            targetBase.app_token,
            sourceTable.table_id,
            snapshotTableName
          );
          totalRecordsProcessed += recordsProcessed;
        } catch (error) {
          this.errors.push({
            table: sourceTable.name,
            message: `Failed to process table: ${(error as Error).message}`,
          });
        }
      }

      // 5. Grant admin permission if requested
      if (config.grantAdminPermission) {
        try {
          const currentUser = await this.client.getCurrentUser();
          await this.client.addCollaborator(
            targetBase.app_token,
            currentUser.user_id,
            'full_access'
          );
        } catch (error) {
          this.errors.push({
            message: `Failed to grant admin permission: ${(error as Error).message}`,
          });
        }
      }

      return {
        success: this.errors.length === 0,
        sourceBase,
        targetBase,
        tablesProcessed: sourceTables.length,
        recordsProcessed: totalRecordsProcessed,
        fieldsConverted: this.fieldsConverted,
        errors: this.errors,
        createdAt: startTime.toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        sourceBase: { app_token: '', name: '', url: config.sourceBaseUrl },
        targetBase: { app_token: '', name: config.targetBaseName },
        tablesProcessed: 0,
        recordsProcessed: 0,
        fieldsConverted: 0,
        errors: [{ message: (error as Error).message }],
        createdAt: startTime.toISOString(),
      };
    }
  }

  /**
   * Process a single table: copy structure and data
   */
  private async processTable(
    sourceAppToken: string,
    targetAppToken: string,
    sourceTableId: string,
    tableName: string
  ): Promise<number> {
    console.log(`Processing table: ${tableName} (${sourceTableId})`);

    // 1. Get source fields (with fallback for Advanced Permissions)
    const sourceFields = await this.client.listFieldsWithFallback(
      sourceAppToken,
      sourceTableId
    );

    if (sourceFields.length === 0) {
      console.log(`No fields retrieved for ${tableName}, skipping table`);
      this.errors.push({
        table: tableName,
        message: 'Could not retrieve field definitions (Advanced Permissions may be blocking access)',
      });
      return 0;
    }

    console.log(`Got ${sourceFields.length} fields for ${tableName}`);

    // 2. Convert field definitions (dynamic -> static)
    const targetFields = this.convertFieldDefinitions(sourceFields);

    // 3. Create table in target base
    const targetTable = await this.client.createTable(
      targetAppToken,
      tableName,
      targetFields
    );
    console.log(`Created target table: ${targetTable.table_id}`);

    // 4. Get target field names (for batch_create API which uses field names as keys)
    const targetFieldList = await this.client.listFields(
      targetAppToken,
      targetTable.table_id
    );
    const targetFieldNames = new Set(targetFieldList.map((f) => f.field_name));

    // 5. Get source records (with fallback for Advanced Permissions)
    const sourceRecords = await this.client.listRecordsWithFallback(
      sourceAppToken,
      sourceTableId
    );

    if (sourceRecords.length === 0) {
      console.log(`No records to copy for ${tableName}`);
      return 0;
    }

    console.log(`Got ${sourceRecords.length} records for ${tableName}`);

    // Debug: log first record structure
    if (sourceRecords.length > 0) {
      console.log('First source record fields keys:', Object.keys(sourceRecords[0].fields || {}));
      console.log('Target field names sample:', Array.from(targetFieldNames).slice(0, 5));
    }

    // 6. Convert record values (use field names as keys for batch_create API)
    const targetRecords = sourceRecords.map((record, idx) => {
      const converted = this.convertRecordValues(
        record.fields,
        sourceFields,
        targetFieldNames
      );
      // Debug first record
      if (idx === 0) {
        console.log('First converted record field count:', Object.keys(converted).length);
        console.log('First converted record sample:', JSON.stringify(converted).substring(0, 500));
      }
      return { fields: converted };
    });

    // 7. Create records in target table
    const createdRecords = await this.client.createRecords(
      targetAppToken,
      targetTable.table_id,
      targetRecords
    );

    console.log(`Copied ${sourceRecords.length} records to ${tableName}, created: ${createdRecords.length}`);
    return sourceRecords.length;
  }

  /**
   * Convert field definitions from dynamic to static types
   */
  private convertFieldDefinitions(
    sourceFields: LarkField[]
  ): Partial<LarkField>[] {
    return sourceFields.map((field) => {
      // Check by ui_type string AND by type number (for fields with undefined ui_type)
      const isDynamic = DYNAMIC_FIELD_TYPES.includes(field.ui_type) ||
                        [11, 18, 19, 20, 21, 1003, 1004].includes(field.type);
      const isUnsupported = UNSUPPORTED_FIELD_TYPES.includes(field.ui_type as string);

      // Debug: log all field types to identify unsupported ones
      console.log(`Field: ${field.field_name}, ui_type: ${field.ui_type}, type: ${field.type}, isDynamic: ${isDynamic}, isUnsupported: ${isUnsupported}`);

      if (isDynamic) {
        this.fieldsConverted++;

        // Convert to text field for most dynamic types
        return {
          field_name: field.field_name,
          type: FIELD_TYPE_MAP.Text,
          ui_type: 'Text' as LarkFieldType,
        };
      }

      // Check both ui_type string AND type number for unsupported fields
      const unsupportedByNumber = UNSUPPORTED_TYPE_NUMBERS.includes(field.type);
      if (isUnsupported || unsupportedByNumber) {
        this.fieldsConverted++;
        console.log(`Converting unsupported field: ${field.field_name} (type: ${field.type}, ui_type: ${field.ui_type})`);

        // Convert unsupported types to appropriate basic types
        if (field.type === 24 || field.type === 1050 || field.ui_type === 'Rating' || field.ui_type === 'Currency') {
          // Convert to Number field
          return {
            field_name: field.field_name,
            type: FIELD_TYPE_MAP.Number,
            ui_type: 'Number' as LarkFieldType,
          };
        }
        // Default: convert to Text field
        return {
          field_name: field.field_name,
          type: FIELD_TYPE_MAP.Text,
          ui_type: 'Text' as LarkFieldType,
        };
      }

      // Keep original field type for static fields
      return {
        field_name: field.field_name,
        type: field.type,
        ui_type: field.ui_type,
        property: this.sanitizeProperty(field.property, field.ui_type),
      };
    });
  }

  /**
   * Sanitize field property (remove link-related properties)
   */
  private sanitizeProperty(
    property: LarkField['property'],
    uiType: LarkFieldType
  ): LarkField['property'] {
    if (!property) return undefined;

    // Remove link-related properties
    const sanitized = { ...property };
    delete sanitized.table_id;
    delete sanitized.link_table_id;
    delete sanitized.back_field_id;
    delete sanitized.formula_expression;

    // Keep select options for select fields, but strip IDs (new Base will generate new IDs)
    if (uiType === 'SingleSelect' || uiType === 'MultiSelect') {
      if (sanitized.options && Array.isArray(sanitized.options)) {
        // Remove 'id' from each option - Lark API will generate new IDs
        const cleanOptions = sanitized.options
          .filter((opt: { name?: string }) => opt.name) // Only keep options with names
          .map((opt: { name: string; color?: number; id?: string }) => ({
            name: opt.name,
            color: opt.color,
          }));
        return { options: cleanOptions };
      }
      return { options: [] };
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  /**
   * Convert record values from dynamic to static
   * Note: Lark API batch_create uses field NAMES as keys, not field IDs
   */
  private convertRecordValues(
    fields: Record<string, LarkCellValue>,
    sourceFields: LarkField[],
    targetFieldNames: Set<string>
  ): Record<string, unknown> {
    const converted: Record<string, unknown> = {};

    for (const sourceField of sourceFields) {
      // Lark API returns record fields keyed by field NAME
      const value = fields[sourceField.field_name];
      const fieldName = sourceField.field_name;

      // Skip if field doesn't exist in target or value is null/undefined
      if (!targetFieldNames.has(fieldName) || value === null || value === undefined) {
        continue;
      }

      // Check if dynamic by ui_type OR by type number (for fields with undefined ui_type)
      const isDynamic = DYNAMIC_FIELD_TYPES.includes(sourceField.ui_type) ||
                        [11, 18, 19, 20, 21, 1003, 1004].includes(sourceField.type);

      if (isDynamic) {
        // Use field NAME as key (not field ID) for batch_create API
        // Dynamic fields are converted to Text, so ensure value is string
        const convertedValue = this.convertDynamicValue(
          value,
          sourceField.ui_type
        );
        // Force to string since dynamic fields become Text fields
        converted[fieldName] = typeof convertedValue === 'number'
          ? String(convertedValue)
          : convertedValue;
      } else {
        // Check if this field type was converted to a different type
        const isUnsupportedType = UNSUPPORTED_TYPE_NUMBERS.includes(sourceField.type);

        // Handle Number fields specially to avoid conversion errors
        if (sourceField.ui_type === 'Number' || sourceField.ui_type === 'Currency' ||
            sourceField.ui_type === 'Progress' || sourceField.ui_type === 'Rating') {
          const numValue = this.sanitizeNumberValue(value);
          if (numValue !== null) {
            converted[fieldName] = numValue;
          }
        } else if (isUnsupportedType) {
          // Unsupported fields are converted to Text, so ensure value is string
          converted[fieldName] = this.extractTextFromValue(value);
        } else {
          converted[fieldName] = value;
        }
      }
    }

    return converted;
  }

  /**
   * Sanitize number field values to ensure they are valid numbers
   */
  private sanitizeNumberValue(value: LarkCellValue): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  /**
   * Convert a dynamic field value to static text
   */
  private convertDynamicValue(
    value: LarkCellValue,
    uiType: LarkFieldType
  ): string | number {
    if (value === null || value === undefined) {
      return '';
    }

    switch (uiType) {
      case 'User':
      case 'CreatedUser':
      case 'ModifiedUser':
        return this.convertUserValue(value);

      case 'SingleLink':
      case 'DuplexLink':
        return this.convertLinkValue(value);

      case 'Lookup':
        return this.convertLookupValue(value);

      case 'Formula':
        return this.convertFormulaValue(value);

      case 'Attachment':
        return this.convertAttachmentValue(value);

      default:
        return String(value);
    }
  }

  /**
   * Convert user field value to text
   */
  private convertUserValue(value: LarkCellValue): string {
    if (Array.isArray(value)) {
      return (value as LarkUserValue[])
        .map((u) => u.name || u.en_name || u.id)
        .join(', ');
    }

    const user = value as LarkUserValue;
    return user.name || user.en_name || user.id || '';
  }

  /**
   * Convert link (relation) field value to text
   */
  private convertLinkValue(value: LarkCellValue): string {
    if (!Array.isArray(value)) {
      return '';
    }

    return (value as LarkLinkValue[])
      .map((link) => link.text || link.record_id)
      .join(', ');
  }

  /**
   * Convert attachment field value to file names
   */
  private convertAttachmentValue(value: LarkCellValue): string {
    if (!Array.isArray(value)) {
      return '';
    }

    return (value as LarkAttachmentValue[])
      .map((att) => att.name || att.file_token || '')
      .filter((name) => name !== '')
      .join(', ');
  }

  /**
   * Convert lookup field value to text
   */
  private convertLookupValue(value: LarkCellValue): string {
    // Lookup values can be arrays of various types
    if (Array.isArray(value)) {
      return value
        .map((v) => this.extractTextFromValue(v))
        .filter((s) => s !== '')
        .join(', ');
    }

    if (typeof value === 'object' && value !== null) {
      return this.extractTextFromValue(value);
    }

    return String(value);
  }

  /**
   * Convert formula field value
   */
  private convertFormulaValue(value: LarkCellValue): string | number {
    // Formula can return string, number, or complex types
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.extractTextFromValue(v)).join(', ');
    }

    // Handle object values (Lark returns formula results as objects)
    if (typeof value === 'object' && value !== null) {
      return this.extractTextFromValue(value);
    }

    return String(value);
  }

  /**
   * Extract text from complex Lark value objects
   */
  private extractTextFromValue(val: unknown): string {
    if (val === null || val === undefined) {
      return '';
    }

    if (typeof val === 'string') {
      return val;
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }

    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>;

      // Try common property names for text values
      if ('text' in obj && typeof obj.text === 'string') {
        return obj.text;
      }
      if ('value' in obj) {
        return this.extractTextFromValue(obj.value);
      }
      if ('name' in obj && typeof obj.name === 'string') {
        return obj.name;
      }
      if ('en_name' in obj && typeof obj.en_name === 'string') {
        return obj.en_name;
      }

      // If it's an array, recursively extract
      if (Array.isArray(obj)) {
        return obj.map((item) => this.extractTextFromValue(item)).join(', ');
      }

      // Last resort: JSON stringify
      return JSON.stringify(val);
    }

    return String(val);
  }
}

export default SnapshotService;
