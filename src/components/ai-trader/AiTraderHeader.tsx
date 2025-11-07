'use client'

import { AppBar, Toolbar, Typography, Button, Box, Chip } from '@mui/material'
import { ArrowBack, SmartToy } from '@mui/icons-material'
import { useRouter } from 'next/navigation'

export function AiTraderHeader({
  traderName,
  traderUsername,
  traderId,
  themeColor,
}: {
  traderName: string
  traderUsername: string
  traderId: string
  themeColor: string
}) {
  const router = useRouter()

  return (
    <AppBar position="static" sx={{ mb: 3, backgroundColor: '#0a0a0a', borderBottom: `2px solid ${themeColor}` }}>
      <Toolbar>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: themeColor,
            boxShadow: `0 0 12px ${themeColor}`,
            mr: 2,
          }}
        />
        <SmartToy sx={{ mr: 1, color: themeColor }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {traderName} <Typography component="span" variant="body2" color="text.secondary">@{traderUsername}</Typography>
        </Typography>
        <Chip
          label="AI Trader"
          size="small"
          sx={{
            mr: 2,
            backgroundColor: `${themeColor}20`,
            color: themeColor,
            borderColor: themeColor,
            border: '1px solid',
          }}
        />
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={() => router.push('/dashboard/dashboard')}
          sx={{
            borderColor: themeColor,
            color: themeColor,
            '&:hover': {
              borderColor: themeColor,
              backgroundColor: `${themeColor}20`,
            },
          }}
        >
          Return to My Dashboard
        </Button>
      </Toolbar>
    </AppBar>
  )
}

