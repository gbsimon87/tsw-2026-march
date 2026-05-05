import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppLayout } from '../../layouts/AppLayout';
import { HomePage } from '../../pages/HomePage';
import { AdminPage } from '../../features/dashboard/AdminPage';
import { FeedPage } from '../../features/feed/pages/FeedPage';
import { AuthPage } from '../../features/auth/pages/AuthPage';
import { GoogleCompletePage } from '../../features/auth/pages/GoogleCompletePage';
import { ForgotPasswordPage } from '../../features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../../features/auth/pages/VerifyEmailPage';
import { useAuth } from '../store/AuthContext';
import { NewTeamPage } from '../../features/teams/pages/NewTeamPage';
import { EditTeamPage } from '../../features/teams/pages/EditTeamPage';
import { TeamsPage } from '../../features/teams/pages/TeamsPage';
import { PublicTeamPage } from '../../features/teams/pages/PublicTeamPage';
import { PublicPlayerPage } from '../../features/teams/pages/PublicPlayerPage';
import { OpponentPlaceholderPage } from '../../features/teams/pages/OpponentPlaceholderPage';
import { NewGamePage } from '../../features/games/pages/NewGamePage';
import { GamesListPage } from '../../features/games/pages/GamesListPage';
import { GameTrackPage } from '../../features/games/pages/GameTrackPage';
import { GameDetailPage } from '../../features/games/pages/GameDetailPage';
import { AdminNewLeaguePage } from '../../features/leagues/pages/AdminNewLeaguePage';
import { AdminLeaguePage } from '../../features/leagues/pages/AdminLeaguePage';
import { AdminLeagueSettingsPage } from '../../features/leagues/pages/AdminLeagueSettingsPage';
import { AdminLeagueTeamPage } from '../../features/leagues/pages/AdminLeagueTeamPage';
import { AdminNewLeagueGamePage } from '../../features/leagues/pages/AdminNewLeagueGamePage';
import { PublicLeaguePage } from '../../features/leagues/pages/PublicLeaguePage';
import { PublicLeagueStandingsPage } from '../../features/leagues/pages/PublicLeagueStandingsPage';
import { PublicLeagueGamesPage } from '../../features/leagues/pages/PublicLeagueGamesPage';
import { PublicLeagueTeamPage } from '../../features/leagues/pages/PublicLeagueTeamPage';
import { PublicLeaguePlayerPage } from '../../features/leagues/pages/PublicLeaguePlayerPage';

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

function LandingRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-sm">Loading session...</div>;
  }

  if (user) {
    return <Navigate to="/feed" replace />;
  }

  return <HomePage />;
}

function LegacyLeagueRedirect({ target }) {
  const { leagueId, leagueTeamId } = useParams();
  const targetPath = target
    .replace(':leagueId', leagueId || '')
    .replace(':leagueTeamId', leagueTeamId || '');

  return <Navigate to={targetPath} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/auth/google/complete" element={<GoogleCompletePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/pricing" element={<Navigate to="/" replace />} />
        <Route path="/billing/success" element={<Navigate to="/" replace />} />
        <Route path="/billing/cancel" element={<Navigate to="/" replace />} />
        <Route path="/league/:leagueSlug" element={<PublicLeaguePage />} />
        <Route path="/league/:leagueSlug/standings" element={<PublicLeagueStandingsPage />} />
        <Route path="/league/:leagueSlug/games" element={<PublicLeagueGamesPage />} />
        <Route
          path="/league/:leagueSlug/teams/:teamSlug/players/:leaguePlayerId"
          element={<PublicLeaguePlayerPage />}
        />
        <Route path="/league/:leagueSlug/teams/:teamSlug" element={<PublicLeagueTeamPage />} />
        <Route
          path="/teams"
          element={
            <ProtectedRoute>
              <TeamsPage />
            </ProtectedRoute>
          }
        />
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
        <Route path="/opponents/:opponentSlug" element={<OpponentPlaceholderPage />} />
        <Route path="/teams/:teamId/players/:playerId" element={<PublicPlayerPage />} />
        <Route path="/teams/:teamId" element={<PublicTeamPage />} />
        <Route path="/leagues" element={<Navigate to="/admin" replace />} />
        <Route path="/leagues/new" element={<Navigate to="/admin/leagues/new" replace />} />
        <Route
          path="/leagues/:leagueId/manage"
          element={<LegacyLeagueRedirect target="/admin/leagues/:leagueId/settings" />}
        />
        <Route
          path="/leagues/:leagueId/teams/:leagueTeamId"
          element={<LegacyLeagueRedirect target="/admin/leagues/:leagueId/teams/:leagueTeamId" />}
        />
        <Route
          path="/leagues/:leagueId/games/new"
          element={<LegacyLeagueRedirect target="/admin/leagues/:leagueId/games/new" />}
        />
        <Route
          path="/leagues/:leagueId"
          element={<LegacyLeagueRedirect target="/admin/leagues/:leagueId" />}
        />
        <Route
          path="/admin/leagues/new"
          element={
            <ProtectedRoute>
              <AdminNewLeaguePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/leagues/:leagueId"
          element={
            <ProtectedRoute>
              <AdminLeaguePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/leagues/:leagueId/settings"
          element={
            <ProtectedRoute>
              <AdminLeagueSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/leagues/:leagueId/teams/:leagueTeamId"
          element={
            <ProtectedRoute>
              <AdminLeagueTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/leagues/:leagueId/games/new"
          element={
            <ProtectedRoute>
              <AdminNewLeagueGamePage />
            </ProtectedRoute>
          }
        />
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
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
