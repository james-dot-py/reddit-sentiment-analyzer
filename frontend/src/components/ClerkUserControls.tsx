import { Link } from 'react-router-dom';
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';

/** Clerk user controls for the header. Must be inside ClerkProvider. */
export function ClerkUserControls() {
  return (
    <>
      <SignedIn>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: 'w-8 h-8',
            },
          }}
        />
      </SignedIn>
      <SignedOut>
        <Link
          to="/sign-in"
          className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors no-underline"
        >
          Sign In
        </Link>
      </SignedOut>
    </>
  );
}
