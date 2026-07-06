import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../store/AuthContext';
import { PostHogRouteTracker } from '../../features/analytics/PostHogRouteTracker';
import { queryClient } from './queryClient';

export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <PostHogRouteTracker />
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
