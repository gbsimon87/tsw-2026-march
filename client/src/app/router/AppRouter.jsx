import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppLayout } from '../../layouts/AppLayout';
import { HomePage } from '../../pages/HomePage';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { env } from '../../lib/env';
import { SportsLoader } from '../../components/SportsLoader';
import { FeedPage } from '../../features/feed/pages/FeedPage';
import { useAuth } from '../store/AuthContext';

// Eager above: the app shell, the default `/pulse` route (FeedPage), and the
// tiny always-reachable pages — keeping these in the entry bundle avoids a
// Suspense flash on first paint. Everything below is code-split so it only
// downloads when its route is visited (OPT-001).
const PricingPage = lazy(() =>
  import('../../features/billing/pages/PricingPage').then((m) => ({ default: m.PricingPage }))
);
const AdminPage = lazy(() =>
  import('../../features/dashboard/AdminPage').then((m) => ({ default: m.AdminPage }))
);
const AuthPage = lazy(() =>
  import('../../features/auth/pages/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const GoogleCompletePage = lazy(() =>
  import('../../features/auth/pages/GoogleCompletePage').then((m) => ({
    default: m.GoogleCompletePage,
  }))
);
const ForgotPasswordPage = lazy(() =>
  import('../../features/auth/pages/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  }))
);
const ResetPasswordPage = lazy(() =>
  import('../../features/auth/pages/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  }))
);
const VerifyEmailPage = lazy(() =>
  import('../../features/auth/pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
);
const NewTeamPage = lazy(() =>
  import('../../features/teams/pages/NewTeamPage').then((m) => ({ default: m.NewTeamPage }))
);
const EditTeamPage = lazy(() =>
  import('../../features/teams/pages/EditTeamPage').then((m) => ({ default: m.EditTeamPage }))
);
const TeamsPage = lazy(() =>
  import('../../features/teams/pages/TeamsPage').then((m) => ({ default: m.TeamsPage }))
);
const PublicTeamPage = lazy(() =>
  import('../../features/teams/pages/PublicTeamPage').then((m) => ({ default: m.PublicTeamPage }))
);
const PublicPlayerPage = lazy(() =>
  import('../../features/teams/pages/PublicPlayerPage').then((m) => ({
    default: m.PublicPlayerPage,
  }))
);
const OpponentPlaceholderPage = lazy(() =>
  import('../../features/teams/pages/OpponentPlaceholderPage').then((m) => ({
    default: m.OpponentPlaceholderPage,
  }))
);
const PublicUserProfilePage = lazy(() =>
  import('../../features/players/pages/PublicUserProfilePage').then((m) => ({
    default: m.PublicUserProfilePage,
  }))
);
const NewGamePage = lazy(() =>
  import('../../features/games/pages/NewGamePage').then((m) => ({ default: m.NewGamePage }))
);
const GamesListPage = lazy(() =>
  import('../../features/games/pages/GamesListPage').then((m) => ({ default: m.GamesListPage }))
);
const GameTrackPage = lazy(() =>
  import('../../features/games/pages/GameTrackPage').then((m) => ({ default: m.GameTrackPage }))
);
const GameDetailPage = lazy(() =>
  import('../../features/games/pages/GameDetailPage').then((m) => ({ default: m.GameDetailPage }))
);
const AdminNewLeaguePage = lazy(() =>
  import('../../features/leagues/pages/AdminNewLeaguePage').then((m) => ({
    default: m.AdminNewLeaguePage,
  }))
);
const AdminLeaguePage = lazy(() =>
  import('../../features/leagues/pages/AdminLeaguePage').then((m) => ({
    default: m.AdminLeaguePage,
  }))
);
const AdminLeagueTeamPage = lazy(() =>
  import('../../features/leagues/pages/AdminLeagueTeamPage').then((m) => ({
    default: m.AdminLeagueTeamPage,
  }))
);
const AdminTeamPage = lazy(() =>
  import('../../features/teams/pages/AdminTeamPage').then((m) => ({ default: m.AdminTeamPage }))
);
const AdminNewLeagueGamePage = lazy(() =>
  import('../../features/leagues/pages/AdminNewLeagueGamePage').then((m) => ({
    default: m.AdminNewLeagueGamePage,
  }))
);
const AdminNewLeagueTeamPage = lazy(() =>
  import('../../features/leagues/pages/AdminNewLeagueTeamPage').then((m) => ({
    default: m.AdminNewLeagueTeamPage,
  }))
);
const PublicLeaguePage = lazy(() =>
  import('../../features/leagues/pages/PublicLeaguePage').then((m) => ({
    default: m.PublicLeaguePage,
  }))
);
const PublicLeagueStandingsPage = lazy(() =>
  import('../../features/leagues/pages/PublicLeagueStandingsPage').then((m) => ({
    default: m.PublicLeagueStandingsPage,
  }))
);
const PublicLeagueGamesPage = lazy(() =>
  import('../../features/leagues/pages/PublicLeagueGamesPage').then((m) => ({
    default: m.PublicLeagueGamesPage,
  }))
);
const PublicLeagueTeamPage = lazy(() =>
  import('../../features/leagues/pages/PublicLeagueTeamPage').then((m) => ({
    default: m.PublicLeagueTeamPage,
  }))
);
const PublicLeaguePlayerPage = lazy(() =>
  import('../../features/leagues/pages/PublicLeaguePlayerPage').then((m) => ({
    default: m.PublicLeaguePlayerPage,
  }))
);
const MySportyPage = lazy(() =>
  import('../../features/leagues/pages/MySportyPage').then((m) => ({ default: m.MySportyPage }))
);
const FollowingPage = lazy(() =>
  import('../../features/follows/pages/FollowingPage').then((m) => ({ default: m.FollowingPage }))
);
const AboutPage = lazy(() =>
  import('../../pages/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const ContactPage = lazy(() =>
  import('../../pages/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const BillingSuccessPage = lazy(() =>
  import('../../features/billing/pages/BillingSuccessPage').then((m) => ({
    default: m.BillingSuccessPage,
  }))
);
const BillingCancelPage = lazy(() =>
  import('../../features/billing/pages/BillingCancelPage').then((m) => ({
    default: m.BillingCancelPage,
  }))
);

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <SportsLoader label="Loading session" fullPage />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
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
    <Suspense fallback={<SportsLoader label="Loading" fullPage />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/pulse" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/feed" element={<Navigate to="/pulse" replace />} />
          <Route path="/pulse" element={<FeedPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/auth/google/complete" element={<GoogleCompletePage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/pricing"
            element={
              env.appEnv === 'production' ? <Navigate to="/pulse" replace /> : <PricingPage />
            }
          />
          <Route path="/billing/success" element={<BillingSuccessPage />} />
          <Route path="/billing/cancel" element={<BillingCancelPage />} />
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
          <Route path="/players/:userId" element={<PublicUserProfilePage />} />
          <Route path="/teams/:teamId" element={<PublicTeamPage />} />
          <Route path="/leagues" element={<Navigate to="/admin" replace />} />
          <Route path="/leagues/new" element={<Navigate to="/pricing" replace />} />
          <Route
            path="/leagues/:leagueId/manage"
            element={<LegacyLeagueRedirect target="/admin/leagues/:leagueId" />}
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
            path="/admin/leagues/:leagueId/teams/new"
            element={
              <ProtectedRoute>
                <AdminNewLeagueTeamPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/teams/:teamId"
            element={
              <ProtectedRoute>
                <AdminTeamPage />
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
          <Route path="/games/:gameId" element={<GameDetailPage />} />
          <Route
            path="/my-sporty"
            element={
              <ProtectedRoute>
                <MySportyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/following"
            element={
              <ProtectedRoute>
                <FollowingPage />
              </ProtectedRoute>
            }
          />
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route
          path="/games/:gameId/track"
          element={
            <ProtectedRoute>
              <GameTrackPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
