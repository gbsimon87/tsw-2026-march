import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../../layouts/AppLayout';
import { HomePage } from '../../pages/HomePage';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { LoginPage } from '../../features/auth/pages/LoginPage';
import { RegisterPage } from '../../features/auth/pages/RegisterPage';
import { ForgotPasswordPage } from '../../features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../../features/auth/pages/VerifyEmailPage';
import { useAuth } from '../store/AuthContext';
import { NewTeamPage } from '../../features/teams/pages/NewTeamPage';
import { EditTeamPage } from '../../features/teams/pages/EditTeamPage';
import { PublicTeamPage } from '../../features/teams/pages/PublicTeamPage';
import { NewGamePage } from '../../features/games/pages/NewGamePage';
import { GamesListPage } from '../../features/games/pages/GamesListPage';
import { GameTrackPage } from '../../features/games/pages/GameTrackPage';
import { GameDetailPage } from '../../features/games/pages/GameDetailPage';

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-sm">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/teams/new"
          element={
            <ProtectedRoute>
              <NewTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teams/:teamId/edit"
          element={
            <ProtectedRoute>
              <EditTeamPage />
            </ProtectedRoute>
          }
        />
        <Route path="/teams/:teamId" element={<PublicTeamPage />} />
        <Route
          path="/games/new"
          element={
            <ProtectedRoute>
              <NewGamePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games"
          element={
            <ProtectedRoute>
              <GamesListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/:gameId/track"
          element={
            <ProtectedRoute>
              <GameTrackPage />
            </ProtectedRoute>
          }
        />
        <Route path="/games/:gameId" element={<GameDetailPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
