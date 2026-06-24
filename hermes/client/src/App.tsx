import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '~/auth/AuthContext';
import { Spinner } from '~/components/ui';
import LoginPage from '~/pages/LoginPage';
import RegisterPage from '~/pages/RegisterPage';
import ChatPage from '~/pages/ChatPage';
import AdminPage from '~/pages/AdminPage';

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
      <Route path="/" element={authed ? <ChatPage /> : <Navigate to="/login" replace />} />
      <Route
        path="/c/:conversationId"
        element={authed ? <ChatPage /> : <Navigate to="/login" replace />}
      />
      <Route path="/admin" element={authed ? <AdminPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
