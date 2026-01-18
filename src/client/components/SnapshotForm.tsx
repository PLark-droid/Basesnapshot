import { useState } from 'react';

interface SnapshotResult {
  success: boolean;
  sourceBase: { name: string };
  targetBase: { name: string; url?: string };
  tablesProcessed: number;
  recordsProcessed: number;
  fieldsConverted: number;
  errors: Array<{ message: string }>;
}

interface SnapshotFormProps {
  onComplete: (result: SnapshotResult) => void;
}

interface TableInfo {
  name: string;
  tableId: string;
  fieldCount: number;
  dynamicFieldCount: number;
}

interface PreviewData {
  base: { name: string };
  tables: TableInfo[];
  totalTables: number;
  totalDynamicFields: number;
}

export function SnapshotForm({ onComplete }: SnapshotFormProps) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [targetName, setTargetName] = useState('');
  const [grantAdmin, setGrantAdmin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!sourceUrl) {
      setError('Source URL is required');
      return;
    }

    setPreviewing(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch('/api/snapshot/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sourceBaseUrl: sourceUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Preview failed');
      }

      setPreview(data);

      // Auto-select all tables
      if (data.tables) {
        setSelectedTables(new Set(data.tables.map((t: TableInfo) => t.tableId)));
      }

      // Auto-fill target name if empty
      if (!targetName && data.base?.name) {
        setTargetName(`${data.base.name}_Snapshot`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const toggleTableSelection = (tableId: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  };

  const toggleAllTables = () => {
    if (preview?.tables) {
      if (selectedTables.size === preview.tables.length) {
        setSelectedTables(new Set());
      } else {
        setSelectedTables(new Set(preview.tables.map((t) => t.tableId)));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sourceUrl || !targetName) {
      setError('Source URL and Target Name are required');
      return;
    }

    if (preview && selectedTables.size === 0) {
      setError('Please select at least one table to copy');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sourceBaseUrl: sourceUrl,
          targetBaseName: targetName,
          grantAdminPermission: grantAdmin,
          selectedTableIds: selectedTables.size > 0 ? Array.from(selectedTables) : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Snapshot failed');
      }

      onComplete(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Source URL */}
      <div>
        <label htmlFor="sourceUrl" className="block text-sm font-medium text-gray-700 mb-2">
          Source Base URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            id="sourceUrl"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://xxx.larksuite.com/base/xxxxx"
            className="input-field flex-1"
            required
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || !sourceUrl}
            className="btn-secondary whitespace-nowrap"
          >
            {previewing ? 'Loading...' : 'Preview'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          コピー元の Lark Base の URL を入力してください
        </p>
      </div>

      {/* Preview Result */}
      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 mb-2">
            📊 Source Base: {preview.base.name}
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Tables:</span>{' '}
              <span className="font-medium">{preview.totalTables}</span>
            </div>
            <div>
              <span className="text-gray-600">Dynamic Fields:</span>{' '}
              <span className="font-medium">{preview.totalDynamicFields}</span>
            </div>
          </div>
          {preview.tables.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">Select tables to copy:</p>
                <button
                  type="button"
                  onClick={toggleAllTables}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {selectedTables.size === preview.tables.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="space-y-2">
                {preview.tables.map((table) => (
                  <label
                    key={table.tableId}
                    className="flex items-center gap-2 bg-white px-3 py-2 rounded cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTables.has(table.tableId)}
                      onChange={() => toggleTableSelection(table.tableId)}
                      className="w-4 h-4 text-lark-primary border-gray-300 rounded focus:ring-lark-primary"
                    />
                    <span className="text-sm font-medium">{table.name}</span>
                    <span className="text-xs text-gray-500">
                      ({table.fieldCount} fields)
                    </span>
                    {table.dynamicFieldCount > 0 && (
                      <span className="text-xs text-blue-600">
                        {table.dynamicFieldCount} dynamic
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {selectedTables.size} / {preview.tables.length} tables selected
              </p>
            </div>
          )}
        </div>
      )}

      {/* Target Name */}
      <div>
        <label htmlFor="targetName" className="block text-sm font-medium text-gray-700 mb-2">
          New Base Name
        </label>
        <input
          type="text"
          id="targetName"
          value={targetName}
          onChange={(e) => setTargetName(e.target.value)}
          placeholder="My Snapshot"
          className="input-field"
          required
        />
        <p className="text-sm text-gray-500 mt-1">
          新しく作成するスナップショット Base の名前
        </p>
      </div>

      {/* Options */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="grantAdmin"
          checked={grantAdmin}
          onChange={(e) => setGrantAdmin(e.target.checked)}
          className="w-4 h-4 text-lark-primary border-gray-300 rounded focus:ring-lark-primary"
        />
        <label htmlFor="grantAdmin" className="text-sm text-gray-700">
          管理者権限を付与する
        </label>
      </div>
      <p className="text-xs text-gray-500">
        ※ 添付ファイルはファイル名のみがコピーされます（Lark API制約）
      </p>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || !sourceUrl || !targetName || (preview && selectedTables.size === 0)}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Creating Snapshot...
          </>
        ) : (
          <>
            <span>📸</span>
            Create Snapshot
          </>
        )}
      </button>
    </form>
  );
}
