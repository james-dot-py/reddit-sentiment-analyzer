import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { BrandSelectPage } from './pages/BrandSelectPage';
import { setAuthTokenGetter } from './api';

const LandingPage = lazy(() =>
  import('./pages/LandingPage').then(m => ({ default: m.LandingPage }))
);
const OnboardingPage = lazy(() =>
  import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage }))
);
const SignInPage = lazy(() =>
  import('./pages/SignInPage').then(m => ({ default: m.SignInPage }))
);
const SignUpPage = lazy(() =>
  import('./pages/SignUpPage').then(m => ({ default: m.SignUpPage }))
);
const PricingPage = lazy(() =>
  import('./pages/PricingPage').then(m => ({ default: m.PricingPage }))
);

export const hasClerk = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const loading = <div className="min-h-screen bg-[var(--surface-0)]" />;

/*
 * AuthBridge and ClerkGuard use Clerk hooks, so they MUST only render
 * inside ClerkProvider (which is only mounted when hasClerk is true in main.tsx).
 * They are conditionally rendered via `{hasClerk && ...}` in App below.
 */

/** Lazy-loaded Clerk auth bridge — only imported when Clerk is configured. */
const ClerkAuthBridge = lazy(() =>
  import('./components/ClerkAuthBridge').then(m => ({ default: m.ClerkAuthBridge }))
);
const ClerkGuard = lazy(() =>
  import('./components/ClerkGuard').then(m => ({ default: m.ClerkGuard }))
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!hasClerk) return <>{children}</>;
  return (
    <Suspense fallback={loading}>
      <ClerkGuard>{children}</ClerkGuard>
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      {hasClerk && (
        <Suspense fallback={null}>
          <ClerkAuthBridge />
        </Suspense>
      )}
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Suspense fallback={loading}><LandingPage /></Suspense>} />
        <Route path="/sign-in/*" element={<Suspense fallback={loading}><SignInPage /></Suspense>} />
        <Route path="/sign-up/*" element={<Suspense fallback={loading}><SignUpPage /></Suspense>} />

        {/* Protected routes */}
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <Layout>
                <Suspense fallback={loading}><OnboardingPage /></Suspense>
              </Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/pricing"
          element={<Layout><Suspense fallback={loading}><PricingPage /></Suspense></Layout>}
        />
        <Route
          path="/brands"
          element={<RequireAuth><Layout><BrandSelectPage /></Layout></RequireAuth>}
        />
        <Route
          path="/dashboard"
          element={<RequireAuth><Layout><DashboardPage /></Layout></RequireAuth>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
