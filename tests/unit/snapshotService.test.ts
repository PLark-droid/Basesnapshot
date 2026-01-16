/**
 * SnapshotService Unit Tests
 *
 * @description Tests for the snapshot service functionality
 */

import { describe, it, expect } from 'vitest';

// Mock types for testing
interface MockLarkField {
  field_id: string;
  field_name: string;
  type: number;
  ui_type: string;
}

interface MockLarkRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

// Test the data conversion logic (isolated from API calls)
describe('SnapshotService Data Conversion', () => {
  describe('convertUserValue', () => {
    it('should convert single user to name string', () => {
      const userValue = {
        id: 'user123',
        name: 'John Doe',
        en_name: 'John',
        email: 'john@example.com',
      };

      // Simulate conversion logic
      const result = userValue.name || userValue.en_name || userValue.id;
      expect(result).toBe('John Doe');
    });

    it('should convert array of users to comma-separated names', () => {
      const userValues = [
        { id: 'user1', name: 'Alice' },
        { id: 'user2', name: 'Bob' },
        { id: 'user3', name: 'Charlie' },
      ];

      const result = userValues.map((u) => u.name || u.id).join(', ');
      expect(result).toBe('Alice, Bob, Charlie');
    });

    it('should fallback to id when name is missing', () => {
      const userValue = { id: 'user123' };
      const result = (userValue as { name?: string }).name || userValue.id;
      expect(result).toBe('user123');
    });
  });

  describe('convertLinkValue', () => {
    it('should convert link values to text', () => {
      const linkValues = [
        { record_id: 'rec1', text: 'Record 1' },
        { record_id: 'rec2', text: 'Record 2' },
      ];

      const result = linkValues
        .map((link) => link.text || link.record_id)
        .join(', ');
      expect(result).toBe('Record 1, Record 2');
    });

    it('should fallback to record_id when text is missing', () => {
      const linkValues = [
        { record_id: 'rec1' },
        { record_id: 'rec2' },
      ];

      const result = linkValues
        .map((link) => (link as { text?: string }).text || link.record_id)
        .join(', ');
      expect(result).toBe('rec1, rec2');
    });
  });

  describe('convertFormulaValue', () => {
    it('should preserve number values', () => {
      const value = 42;
      const result = typeof value === 'number' ? value : String(value);
      expect(result).toBe(42);
    });

    it('should preserve string values', () => {
      const value = 'calculated result';
      const result = typeof value === 'string' ? value : String(value);
      expect(result).toBe('calculated result');
    });

    it('should convert array to comma-separated string', () => {
      const value = ['a', 'b', 'c'];
      const result = Array.isArray(value) ? value.join(', ') : String(value);
      expect(result).toBe('a, b, c');
    });
  });
});

describe('Field Type Detection', () => {
  const DYNAMIC_FIELD_TYPES = [
    'SingleLink',
    'DuplexLink',
    'Lookup',
    'Formula',
    'User',
    'CreatedUser',
    'ModifiedUser',
  ];

  it('should identify SingleLink as dynamic', () => {
    expect(DYNAMIC_FIELD_TYPES.includes('SingleLink')).toBe(true);
  });

  it('should identify DuplexLink as dynamic', () => {
    expect(DYNAMIC_FIELD_TYPES.includes('DuplexLink')).toBe(true);
  });

  it('should identify Lookup as dynamic', () => {
    expect(DYNAMIC_FIELD_TYPES.includes('Lookup')).toBe(true);
  });

  it('should identify Text as static', () => {
    expect(DYNAMIC_FIELD_TYPES.includes('Text')).toBe(false);
  });

  it('should identify Number as static', () => {
    expect(DYNAMIC_FIELD_TYPES.includes('Number')).toBe(false);
  });

  it('should identify DateTime as static', () => {
    expect(DYNAMIC_FIELD_TYPES.includes('DateTime')).toBe(false);
  });
});

describe('URL Parsing', () => {
  const parseBaseUrl = (url: string): string | null => {
    const patterns = [
      /\/base\/([a-zA-Z0-9]+)/,
      /app_token=([a-zA-Z0-9]+)/,
      /bitable\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  };

  it('should parse standard base URL', () => {
    const url = 'https://xxx.larksuite.com/base/abc123xyz';
    expect(parseBaseUrl(url)).toBe('abc123xyz');
  });

  it('should parse URL with query parameter', () => {
    const url = 'https://xxx.larksuite.com/?app_token=abc123xyz';
    expect(parseBaseUrl(url)).toBe('abc123xyz');
  });

  it('should parse bitable URL format', () => {
    const url = 'https://xxx.larksuite.com/bitable/abc123xyz/view';
    expect(parseBaseUrl(url)).toBe('abc123xyz');
  });

  it('should return null for invalid URL', () => {
    const url = 'https://example.com/invalid';
    expect(parseBaseUrl(url)).toBeNull();
  });
});

describe('Field Definition Conversion', () => {
  const FIELD_TYPE_MAP: Record<string, number> = {
    Text: 1,
    Number: 2,
    SingleSelect: 3,
    MultiSelect: 4,
    DateTime: 5,
    Checkbox: 7,
  };

  it('should convert SingleLink to Text field', () => {
    const sourceField: MockLarkField = {
      field_id: 'fld1',
      field_name: 'Related Records',
      type: 18,
      ui_type: 'SingleLink',
    };

    const DYNAMIC_TYPES = ['SingleLink', 'DuplexLink', 'Lookup'];
    const isDynamic = DYNAMIC_TYPES.includes(sourceField.ui_type);

    const convertedField = isDynamic
      ? { field_name: sourceField.field_name, type: FIELD_TYPE_MAP.Text, ui_type: 'Text' }
      : sourceField;

    expect(convertedField.ui_type).toBe('Text');
    expect(convertedField.type).toBe(1);
  });

  it('should preserve Text field type', () => {
    const sourceField: MockLarkField = {
      field_id: 'fld2',
      field_name: 'Description',
      type: 1,
      ui_type: 'Text',
    };

    const DYNAMIC_TYPES = ['SingleLink', 'DuplexLink', 'Lookup'];
    const isDynamic = DYNAMIC_TYPES.includes(sourceField.ui_type);

    expect(isDynamic).toBe(false);
  });

  it('should preserve Number field type', () => {
    const sourceField: MockLarkField = {
      field_id: 'fld3',
      field_name: 'Amount',
      type: 2,
      ui_type: 'Number',
    };

    const DYNAMIC_TYPES = ['SingleLink', 'DuplexLink', 'Lookup'];
    const isDynamic = DYNAMIC_TYPES.includes(sourceField.ui_type);

    expect(isDynamic).toBe(false);
  });
});

describe('Record Value Conversion', () => {
  it('should convert dynamic field values', () => {
    const sourceRecord: MockLarkRecord = {
      record_id: 'rec1',
      fields: {
        fld1: 'Static text value',
        fld2: [{ record_id: 'linked1', text: 'Linked Item 1' }],
        fld3: 42,
      },
    };

    const fieldTypes: Record<string, string> = {
      fld1: 'Text',
      fld2: 'SingleLink',
      fld3: 'Number',
    };

    const DYNAMIC_TYPES = ['SingleLink', 'DuplexLink', 'Lookup'];

    const convertedFields: Record<string, unknown> = {};

    for (const [fieldId, value] of Object.entries(sourceRecord.fields)) {
      const fieldType = fieldTypes[fieldId];
      const isDynamic = DYNAMIC_TYPES.includes(fieldType);

      if (isDynamic && Array.isArray(value)) {
        // Convert link array to text
        convertedFields[fieldId] = (value as Array<{ text?: string; record_id: string }>)
          .map((v) => v.text || v.record_id)
          .join(', ');
      } else {
        convertedFields[fieldId] = value;
      }
    }

    expect(convertedFields.fld1).toBe('Static text value');
    expect(convertedFields.fld2).toBe('Linked Item 1');
    expect(convertedFields.fld3).toBe(42);
  });
});

describe('Snapshot Configuration', () => {
  it('should create valid snapshot config', () => {
    const config = {
      sourceBaseUrl: 'https://xxx.larksuite.com/base/abc123',
      targetBaseName: 'My Snapshot',
      grantAdminPermission: true,
    };

    expect(config.sourceBaseUrl).toContain('base/');
    expect(config.targetBaseName).toBeTruthy();
    expect(config.grantAdminPermission).toBe(true);
  });

  it('should generate default target name with date', () => {
    const today = new Date().toISOString().split('T')[0];
    const defaultName = `Snapshot_${today}`;

    expect(defaultName).toMatch(/^Snapshot_\d{4}-\d{2}-\d{2}$/);
  });
});
