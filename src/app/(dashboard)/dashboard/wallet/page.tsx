'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from '@mui/material'

interface Wallet {
  id: string
  label: string | null
  pubkey: string
  createdAt: string
}

export default function WalletSetupPage() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [label, setLabel] = useState('')
  const [pubkey, setPubkey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const generateSimulationPubkey = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `sim-${crypto.randomUUID().replace(/-/g, '')}`
    }
    return `sim-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`
  }

  const fetchWallets = async () => {
    try {
      const res = await fetch('/api/wallets')
      if (!res.ok) {
        throw new Error('Failed to load wallets')
      }
      const data = await res.json()
      setWallets(data.wallets ?? [])
    } catch (err) {
      console.error('Failed to load wallets', err)
      setError('Failed to load wallets')
    }
  }

  useEffect(() => {
    fetchWallets()
    setPubkey(generateSimulationPubkey())
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, pubkey }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Failed to create wallet')
        return
      }

      setLabel('')
      setPubkey('')
      setSuccess('Wallet created successfully')
      fetchWallets()
    } catch (err) {
      console.error('Failed to create wallet', err)
      setError('Failed to create wallet')
    } finally {
      setLoading(false)
    }
  }

  const handleGeneratePubkey = () => {
    setPubkey(generateSimulationPubkey())
  }

  return (
    <Container maxWidth="md">
      <Typography variant="h4" component="h1" gutterBottom>
        Wallet Configuration
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Simulation wallets let the dashboard track balances and trades without connecting to an external blockchain. Create a wallet to unlock the dashboard and portfolio views.
      </Typography>

      <Paper component="form" onSubmit={handleSubmit} sx={{ p: 3, mb: 4 }}>
        <Stack spacing={2}>
          {error ? (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          ) : null}
          {success ? (
            <Alert severity="success" onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          ) : null}

          <TextField
            label="Wallet label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            fullWidth
            placeholder="Simulation Wallet"
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'flex-end' }}>
            <TextField
              label="Pubkey"
              value={pubkey}
              onChange={(e) => setPubkey(e.target.value)}
              fullWidth
              placeholder="sim-..."
            />
            <Button variant="outlined" onClick={handleGeneratePubkey} sx={{ whiteSpace: 'nowrap' }}>
              Generate
            </Button>
          </Stack>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? 'Creating...' : 'Create Wallet'}
            </Button>
            <Button component={Link} href="/dashboard" variant="outlined">
              Back to Dashboard
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Existing Wallets
        </Typography>
        {wallets.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No wallets configured yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Label</TableCell>
                  <TableCell>Pubkey</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {wallets.map((wallet) => (
                  <TableRow key={wallet.id}>
                    <TableCell>{wallet.label ?? '—'}</TableCell>
                    <TableCell>{wallet.pubkey}</TableCell>
                    <TableCell>
                      {new Date(wallet.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  )
}

