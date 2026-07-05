import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../store/AuthContext';
import { PostHogRouteTracker } from '../../features/analytics/PostHogRouteTracker';

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
