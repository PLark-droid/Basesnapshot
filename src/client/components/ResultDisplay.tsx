interface SnapshotResult {
  success: boolean;
  sourceBase: { name: string };
  targetBase: { name: string; url?: string };
  tablesProcessed: number;
  recordsProcessed: number;
  fieldsConverted: number;
  errors: Array<{ message: string }>;
}

interface ResultDisplayProps {
  result: SnapshotResult;
  onReset: () => void;
}

export function ResultDisplay({ result, onReset }: ResultDisplayProps) {
  if (!result.success) {
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-4">❌</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          Snapshot Failed
        </h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-left">
          {result.errors.map((error, index) => (
            <p key={index} className="text-red-700 text-sm">
              {error.message}
            </p>
          ))}
        </div>
        <button onClick={onReset} className="btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-4">✅</div>
      <h3 className="text-xl font-semibold text-gray-800 mb-2">
        Snapshot Created Successfully!
      </h3>
      <p className="text-gray-600 mb-6">
        {result.sourceBase.name} → {result.targetBase.name}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-lark-primary">
            {result.tablesProcessed}
          </div>
          <div className="text-sm text-gray-500">Tables</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-lark-primary">
            {result.recordsProcessed}
          </div>
          <div className="text-sm text-gray-500">Records</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-lark-secondary">
            {result.fieldsConverted}
          </div>
          <div className="text-sm text-gray-500">Fields Converted</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        {result.targetBase.url && (
          <a
            href={result.targetBase.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Open Snapshot
          </a>
        )}
        <button onClick={onReset} className="btn-secondary">
          Create Another
        </button>
      </div>
    </div>
  );
}
