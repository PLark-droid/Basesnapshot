/**
 * Lark Base API Type Definitions
 *
 * @description Type definitions for Lark Open API Base operations
 * @see https://open.larksuite.com/document/server-docs/docs/bitable-v1
 */

/** Lark API authentication configuration */
export interface LarkConfig {
  appId: string;
  appSecret: string;
  baseUrl?: string;
}

/** Lark API access token response */
export interface LarkTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire: number;
}

/** Field types in Lark Base */
export type LarkFieldType =
  | 'Text'
  | 'Number'
  | 'SingleSelect'
  | 'MultiSelect'
  | 'DateTime'
  | 'Checkbox'
  | 'User'
  | 'Phone'
  | 'Url'
  | 'Attachment'
  | 'SingleLink'    // Single link (relation)
  | 'DuplexLink'    // Duplex link (bidirectional relation)
  | 'Lookup'        // Lookup field
  | 'Formula'       // Formula field
  | 'AutoNumber'
  | 'CreatedTime'
  | 'ModifiedTime'
  | 'CreatedUser'
  | 'ModifiedUser'
  | 'Barcode'
  | 'Progress'
  | 'Currency'
  | 'Rating'
  | 'Email'
  | 'Location';

/** Field definition in Lark Base */
export interface LarkField {
  field_id: string;
  field_name: string;
  type: number;
  ui_type: LarkFieldType;
  is_primary?: boolean;
  property?: LarkFieldProperty;
}

/** Field property configuration */
export interface LarkFieldProperty {
  options?: LarkSelectOption[];
  formatter?: string;
  date_formatter?: string;
  auto_fill?: boolean;
  multiple?: boolean;
  table_id?: string;           // For link fields
  link_table_id?: string;      // For link fields
  back_field_id?: string;      // For duplex link
  formula_expression?: string; // For formula fields
}

/** Select option for SingleSelect/MultiSelect fields */
export interface LarkSelectOption {
  id?: string;  // Optional - Lark API generates ID for new options
  name: string;
  color?: number;
}

/** Table definition in Lark Base */
export interface LarkTable {
  table_id: string;
  name: string;
  revision: number;
}

/** Record in Lark Base */
export interface LarkRecord {
  record_id: string;
  fields: Record<string, LarkCellValue>;
}

/** Possible cell values in Lark Base */
export type LarkCellValue =
  | string
  | number
  | boolean
  | LarkUserValue
  | LarkUserValue[]
  | LarkLinkValue[]
  | LarkAttachmentValue[]
  | LarkSelectValue
  | LarkSelectValue[]
  | LarkUrlValue
  | null;

/** User field value */
export interface LarkUserValue {
  id: string;
  name?: string;
  en_name?: string;
  email?: string;
  avatar_url?: string;
}

/** Link field value (relation) */
export interface LarkLinkValue {
  record_id: string;
  text?: string;        // Display text (may change)
  table_id?: string;
}

/** Attachment field value */
export interface LarkAttachmentValue {
  file_token: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

/** Select field value */
export interface LarkSelectValue {
  id: string;
  text: string;
}

/** URL field value */
export interface LarkUrlValue {
  text: string;
  link: string;
}

/** Base (App) definition */
export interface LarkBase {
  app_token: string;
  name: string;
  folder_token?: string;
  url?: string;
}

/** API response wrapper */
export interface LarkApiResponse<T> {
  code: number;
  msg: string;
  data?: T;
}

/** List response with pagination */
export interface LarkListResponse<T> {
  items: T[];
  total?: number;
  has_more: boolean;
  page_token?: string;
}

/** Snapshot configuration */
export interface SnapshotConfig {
  sourceBaseUrl: string;
  targetBaseName: string;
  grantAdminPermission: boolean;
  /** Copy attachment files to target Base (default: false, convert to file names) */
  preserveAttachments?: boolean;
  selectedTableIds?: string[];
}

/** Snapshot result */
export interface SnapshotResult {
  success: boolean;
  sourceBase: LarkBase;
  targetBase: LarkBase;
  tablesProcessed: number;
  recordsProcessed: number;
  fieldsConverted: number;
  errors: SnapshotError[];
  createdAt: string;
}

/** Snapshot error */
export interface SnapshotError {
  table?: string;
  record?: string;
  field?: string;
  message: string;
  code?: string;
}

/** Field type mapping for conversion */
export const DYNAMIC_FIELD_TYPES: LarkFieldType[] = [
  'SingleLink',
  'DuplexLink',
  'Lookup',
  'Formula',
  'User',
  'CreatedUser',
  'ModifiedUser',
];

/** Fields that should be converted to static text */
export const CONVERT_TO_TEXT_TYPES: LarkFieldType[] = [
  'SingleLink',
  'DuplexLink',
  'Lookup',
  'User',
  'CreatedUser',
  'ModifiedUser',
];

/** Fields that should be converted to static number */
export const CONVERT_TO_NUMBER_TYPES: LarkFieldType[] = [
  'Formula', // When formula returns number
];
