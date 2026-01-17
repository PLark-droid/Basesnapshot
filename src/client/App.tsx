import { useState, useEffect } from 'react';
import { SnapshotForm } from './components/SnapshotForm';
import { AuthButton } from './components/AuthButton';
import { ResultDisplay } from './components/ResultDisplay';

interface AuthState {
  isAuthenticated: boolean;
  user?: {
    id: string;
    name: string;
  };
}

interface SnapshotResult {
  success: boolean;
  sourceBase: { name: string };
  targetBase: { name: string; url?: string };
  tablesProcessed: number;
  recordsProcessed: number;
  fieldsConverted: number;
  errors: Array<{ message: string }>;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false });
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SnapshotResult | null>(null);

  useEffect(() => {
    // Check authentication status
    checkAuthStatus();

    // Handle OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'success') {
      checkAuthStatus();
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      const data = await res.json();
      setAuthState(data);
    } catch (error) {
      console.error('Failed to check auth status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setAuthState({ isAuthenticated: false });
      setResult(null);
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const handleSnapshotComplete = (snapshotResult: SnapshotResult) => {
    setResult(snapshotResult);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📸</span>
            <h1 className="text-xl font-bold text-gray-800">LarkBaseSnapshot</h1>
          </div>
          <AuthButton
            isAuthenticated={authState.isAuthenticated}
            userName={authState.user?.name}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Lark Base の静的スナップショットを作成
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            lookup、参照、リレーションを静的なテキスト・数値に変換し、
            変化しないスナップショットを作成します。
          </p>
        </div>

        {/* Main Card */}
        <div className="card">
          {!authState.isAuthenticated ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                ログインが必要です
              </h3>
              <p className="text-gray-600 mb-6">
                Lark アカウントでログインしてスナップショットを作成してください
              </p>
              <button onClick={handleLogin} className="btn-primary">
                Lark でログイン
              </button>
            </div>
          ) : result ? (
            <ResultDisplay result={result} onReset={() => setResult(null)} />
          ) : (
            <SnapshotForm onComplete={handleSnapshotComplete} />
          )}
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-6 mt-8">
          <div className="bg-white rounded-lg p-6 shadow">
            <div className="text-3xl mb-3">🔗</div>
            <h3 className="font-semibold text-gray-800 mb-2">リレーション変換</h3>
            <p className="text-gray-600 text-sm">
              双方向・単方向リレーションをテキストに変換
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="font-semibold text-gray-800 mb-2">Lookup 変換</h3>
            <p className="text-gray-600 text-sm">
              参照先の値を静的なテキスト・数値として保存
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow">
            <div className="text-3xl mb-3">👤</div>
            <h3 className="font-semibold text-gray-800 mb-2">管理者権限</h3>
            <p className="text-gray-600 text-sm">
              実行者に新規 Base の管理者権限を自動付与
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-sm">
        Powered by Miyabi Framework
      </footer>
    </div>
  );
}

export default App;
