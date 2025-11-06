'use client'

import { useEffect } from 'react'
import { Box, Button, Paper, Typography } from '@mui/material'

interface FaucetErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function FaucetError({ error, reset }: FaucetErrorProps) {
  useEffect(() => {
    console.error('Faucet page error boundary caught error', {
      message: error.message,
      name: error.name,
      digest: (error as { digest?: string }).digest,
      stack: error.stack,
    })
  }, [error])

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
      <Paper sx={{ p: 4, maxWidth: 480 }}>
        <Typography variant="h5" gutterBottom>
          Something went wrong
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          We couldn&apos;t load the faucet right now. The error has been logged for
          investigation.
        </Typography>
        {error.digest ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Error digest: {error.digest}
          </Typography>
        ) : null}
        <Button variant="contained" onClick={reset}>
          Try again
        </Button>
      </Paper>
    </Box>
  )
}

