import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource-variable/jetbrains-mono/wght.css'

import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''

const app = (
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)

createRoot(document.getElementById('root')!).render(
  clerkPubKey
    ? <ClerkProvider publishableKey={clerkPubKey}>{app}</ClerkProvider>
    : app,
)
