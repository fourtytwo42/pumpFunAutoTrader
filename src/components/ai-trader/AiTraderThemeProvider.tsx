'use client'

import { ThemeProvider, createTheme } from '@mui/material/styles'
import { useMemo } from 'react'

export function AiTraderThemeProvider({
  themeColor,
  children,
}: {
  themeColor: string
  children: React.ReactNode
}) {
  const theme = useMemo(() => {
    return createTheme({
      palette: {
        mode: 'dark',
        primary: {
          main: themeColor,
        },
        background: {
          default: '#0a0a0a',
          paper: '#141414',
        },
      },
      components: {
        MuiButton: {
          styleOverrides: {
            contained: {
              backgroundColor: themeColor,
              '&:hover': {
                backgroundColor: `${themeColor}dd`,
              },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            colorPrimary: {
              backgroundColor: `${themeColor}40`,
              color: themeColor,
              borderColor: themeColor,
            },
          },
        },
      },
    })
  }, [themeColor])

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}

