'use client'

import { useMemo } from 'react'
import { ThemeProvider as MUIThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { useUserPreferences } from './UserPreferencesProvider'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'dark',
          primary: {
            main: preferences.primaryColor,
          },
          secondary: {
            main: preferences.secondaryColor,
          },
          success: {
            main: preferences.primaryColor,
          },
          error: {
            main: preferences.secondaryColor,
          },
          background: {
            default: preferences.backgroundColor,
            paper: preferences.highlightColor,
          },
          text: {
            primary: '#ffffff',
            secondary: 'rgba(255,255,255,0.65)',
          },
        },
        typography: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
        },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundColor: preferences.highlightColor,
                backgroundImage: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                transition: 'background-color 0.3s ease',
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: 'none',
                borderRadius: '8px',
                fontWeight: 600,
              },
              contained: {
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: 'none',
                },
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.2s ease',
                backgroundImage: 'none',
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: '6px',
              },
            },
          },
        },
      }),
    [preferences]
  )

  return (
    <MUIThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MUIThemeProvider>
  )
}

