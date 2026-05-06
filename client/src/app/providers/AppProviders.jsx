import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../store/AuthContext';
import { initPostHog } from '../../lib/posthog';
import { PostHogRouteTracker } from '../../features/analytics/PostHogRouteTracker';

initPostHog();

export function AppProviders({ children }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PostHogRouteTracker />
        {children}
      </AuthProvider>
    </BrowserRouter>
  );
}
