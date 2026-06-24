import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '~/auth/AuthContext';
import { Spinner } from '~/components/ui';
import LoginPage from '~/pages/LoginPage';
import RegisterPage from '~/pages/RegisterPage';
import ChatPage from '~/pages/ChatPage';
import AdminPage from '~/pages/AdminPage';

/** Gate a route to authenticated users; bounces guests to the login screen. */
function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-white text-ink-faint">
        <Spinner size={28} />
      </div>
    );
  }
  return status === 'authenticated' ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Gate a route to admins; non-admins fall back to the chat. Use inside `RequireAuth`. */
function RequireAdmin({ children }: { children: ReactNode }): JSX.Element {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App(): JSX.Element {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-white text-ink-faint">
        <Spinner size={28} />
      </div>
    );
  }

  const authed = status === 'authenticated';
  return (
    <Routes>
      <Route path="/login" element={authed ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={authed ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
      <Route
        path="/c/:conversationId"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/:section?"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
