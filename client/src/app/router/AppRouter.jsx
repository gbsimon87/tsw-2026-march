import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../../layouts/AppLayout';
import { HomePage } from '../../pages/HomePage';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { FeedPage } from '../../features/feed/pages/FeedPage';
import { AuthPage } from '../../features/auth/pages/AuthPage';
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
import { LeaguesPage } from '../../features/leagues/pages/LeaguesPage';
import { NewLeaguePage } from '../../features/leagues/pages/NewLeaguePage';
import { LeagueDetailPage } from '../../features/leagues/pages/LeagueDetailPage';
import { LeagueManagePage } from '../../features/leagues/pages/LeagueManagePage';
import { LeagueTeamPage } from '../../features/leagues/pages/LeagueTeamPage';
import { NewLeagueGamePage } from '../../features/leagues/pages/NewLeagueGamePage';
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

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
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
        <Route
          path="/leagues"
          element={
            <ProtectedRoute>
              <LeaguesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/new"
          element={
            <ProtectedRoute>
              <NewLeaguePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId"
          element={
            <ProtectedRoute>
              <LeagueDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId/manage"
          element={
            <ProtectedRoute>
              <LeagueManagePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId/teams/:leagueTeamId"
          element={
            <ProtectedRoute>
              <LeagueTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leagues/:leagueId/games/new"
          element={
            <ProtectedRoute>
              <NewLeagueGamePage />
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
