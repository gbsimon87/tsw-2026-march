import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4000/api/v1');
vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_tsw');
