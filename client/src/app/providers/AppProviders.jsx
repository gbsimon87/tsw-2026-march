import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../store/AuthContext';
import { initPostHog } from '../../lib/posthog';

initPostHog();

export function AppProviders({ children }) {
  return (
    <BrowserRouter>
      <AuthProvider>{children}</AuthProvider>
    </BrowserRouter>
  );
}
