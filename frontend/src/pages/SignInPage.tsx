import { SignIn } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

export function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-0)] px-4">
      <Link to="/" className="mb-8 flex items-center gap-2.5 no-underline">
        <BarChart3 size={24} className="text-accent-500" />
        <span className="heading text-2xl">Undercurrent</span>
      </Link>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        afterSignInUrl="/brands"
        appearance={{
          variables: {
            colorPrimary: '#0D9488',
            colorBackground: 'var(--surface-1)',
            colorText: 'var(--text-primary)',
            colorTextSecondary: 'var(--text-secondary)',
            borderRadius: '14px',
            fontFamily: "'Inter', sans-serif",
          },
        }}
      />
    </div>
  );
}
