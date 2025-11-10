import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { UserPreferencesProvider } from '@/components/providers/UserPreferencesProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Pump.fun Mock Trader',
  description: 'Mock trading platform for pump.fun tokens',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider>
          <UserPreferencesProvider>
            <ThemeProvider>
              {children}
            </ThemeProvider>
          </UserPreferencesProvider>
        </SessionProvider>
      </body>
    </html>
  )
}

