import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';

/** Auth guard that redirects to /sign-in. Must be inside ClerkProvider. */
export function ClerkGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return <div className="min-h-screen bg-[var(--surface-0)]" />;
  }
  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }
  return <>{children}</>;
}
