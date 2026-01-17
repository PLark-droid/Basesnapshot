interface AuthButtonProps {
  isAuthenticated: boolean;
  userName?: string;
  onLogin: () => void;
  onLogout: () => void;
}

export function AuthButton({
  isAuthenticated,
  userName,
  onLogin,
  onLogout,
}: AuthButtonProps) {
  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-gray-600">
          <span className="text-gray-400">Logged in as</span>{' '}
          <span className="font-medium">{userName}</span>
        </span>
        <button
          onClick={onLogout}
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onLogin}
      className="bg-lark-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
    >
      Login with Lark
    </button>
  );
}
