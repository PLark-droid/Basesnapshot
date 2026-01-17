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

  constructor(config: LarkConfig) {
    this.client = new LarkApiClient(config);
  }

  /**
   * Create a static snapshot of a Lark Base
   */
  async createSnapshot(config: SnapshotConfig): Promise<SnapshotResult> {
    this.errors = [];
    this.fieldsConverted = 0;

    const startTime = new Date();

    try {
      // 1. Parse source URL and get source base info
      const sourceAppToken = this.client.parseBaseUrl(config.sourceBaseUrl);
      const sourceBase = await this.client.getBase(sourceAppToken);

      // 2. Create new target base
      const targetBase = await this.client.createBase(config.targetBaseName);

      // 3. Get all tables from source
      const sourceTables = await this.client.listTables(sourceAppToken);

      let totalRecordsProcessed = 0;

      // 4. Process each table
      for (const sourceTable of sourceTables) {
        try {
          const recordsProcessed = await this.processTable(
            sourceAppToken,
            targetBase.app_token,
            sourceTable.table_id,
            sourceTable.name
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
    // 1. Get source fields
    const sourceFields = await this.client.listFields(
      sourceAppToken,
      sourceTableId
    );

    // 2. Convert field definitions (dynamic -> static)
    const targetFields = this.convertFieldDefinitions(sourceFields);

    // 3. Create table in target base
    const targetTable = await this.client.createTable(
      targetAppToken,
      tableName,
      targetFields
    );

    // 4. Get target field mapping
    const targetFieldList = await this.client.listFields(
      targetAppToken,
      targetTable.table_id
    );
    const fieldNameToId = new Map(
      targetFieldList.map((f) => [f.field_name, f.field_id])
    );

    // 5. Get source records
    const sourceRecords = await this.client.listRecords(
      sourceAppToken,
      sourceTableId
    );

    if (sourceRecords.length === 0) {
      return 0;
    }

    // 6. Convert record values
    const targetRecords = sourceRecords.map((record) => ({
      fields: this.convertRecordValues(
        record.fields,
        sourceFields,
        fieldNameToId
      ),
    }));

    // 7. Create records in target table
    await this.client.createRecords(
      targetAppToken,
      targetTable.table_id,
      targetRecords
    );

    return sourceRecords.length;
  }

  /**
   * Convert field definitions from dynamic to static types
   */
  private convertFieldDefinitions(
    sourceFields: LarkField[]
  ): Partial<LarkField>[] {
    return sourceFields.map((field) => {
      const isDynamic = DYNAMIC_FIELD_TYPES.includes(field.ui_type);

      if (isDynamic) {
        this.fieldsConverted++;

        // Convert to text field for most dynamic types
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

    // Keep select options for select fields
    if (uiType === 'SingleSelect' || uiType === 'MultiSelect') {
      return { options: sanitized.options };
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  /**
   * Convert record values from dynamic to static
   */
  private convertRecordValues(
    fields: Record<string, LarkCellValue>,
    sourceFields: LarkField[],
    fieldNameToId: Map<string, string>
  ): Record<string, unknown> {
    const converted: Record<string, unknown> = {};

    for (const sourceField of sourceFields) {
      const value = fields[sourceField.field_id];
      const targetFieldId = fieldNameToId.get(sourceField.field_name);

      if (!targetFieldId || value === null || value === undefined) {
        continue;
      }

      const isDynamic = DYNAMIC_FIELD_TYPES.includes(sourceField.ui_type);

      if (isDynamic) {
        converted[targetFieldId] = this.convertDynamicValue(
          value,
          sourceField.ui_type
        );
      } else {
        converted[targetFieldId] = value;
      }
    }

    return converted;
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
   * Convert lookup field value to text
   */
  private convertLookupValue(value: LarkCellValue): string {
    // Lookup values can be arrays of various types
    if (Array.isArray(value)) {
      return value
        .map((v) => {
          if (typeof v === 'object' && v !== null) {
            return (v as LarkLinkValue).text || JSON.stringify(v);
          }
          return String(v);
        })
        .join(', ');
    }

    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
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
      return value.map((v) => String(v)).join(', ');
    }

    return JSON.stringify(value);
  }
}

export default SnapshotService;
