'use client'

import { useState } from 'react'
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material'
import { Science } from '@mui/icons-material'

export default function FaucetPage() {
  const [amount, setAmount] = useState('5')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )

  const handleRequest = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/faucet/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount) }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Request failed')
      }

      setMessage({
        type: 'success',
        text: `Successfully received ${data.amount} SOL!`,
      })
      setAmount('5')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container maxWidth="sm">
      <Typography variant="h4" component="h1" gutterBottom>
        Faucet
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Request SOL for testing your trading strategies
      </Typography>

      <Paper sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ textAlign: 'center', mb: 2 }}>
            <Science sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h5">Get Free SOL</Typography>
            <Typography variant="body2" color="text.secondary">
              Default: 5 SOL per request (max 10 requests per day)
            </Typography>
          </Box>

          {message && (
            <Alert
              severity={message.type}
              onClose={() => setMessage(null)}
            >
              {message.text}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Amount (SOL)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0.1, max: 10, step: 0.1 }}
            helperText="Maximum 10 SOL per request"
          />

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleRequest}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <Science />}
          >
            {loading ? 'Requesting...' : 'Request SOL'}
          </Button>

          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Note:</strong> This faucet is for testing purposes only. The SOL you receive
              is virtual and cannot be withdrawn.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Container>
  )
}

