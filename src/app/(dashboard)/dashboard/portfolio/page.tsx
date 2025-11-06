'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
} from '@mui/material'
import { useEventStream } from '@/hooks/useEventStream'

interface SnapshotPosition {
  mint: string
  symbol?: string | null
  qty: number
  avgCostUsd: number
  priceUsd: number
  mtmUsd: number
  pnlUsd: number
  pnlPct: number
}

interface PortfolioSnapshot {
  walletId: string
  solUsd: number
  balanceSol: number
  balanceUsd: number
  equityUsd: number
  realizedUsd: number
  unrealizedUsd: number
  positions: SnapshotPosition[]
}

export default function PortfolioPage() {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSnapshot = async () => {
    try {
      const res = await fetch('/api/portfolio')

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Failed to load portfolio')
        setSnapshot(null)
        return
      }

      const json = await res.json()
      setSnapshot(json)
      setError(null)
    } catch (error) {
      console.error('Failed to load portfolio snapshot', error)
      setSnapshot(null)
      setError('Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSnapshot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEventStream({
    'portfolio:update': () => fetchSnapshot(),
  })

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  if (!snapshot) {
    return (
      <Container maxWidth="lg">
        <Typography variant="h4" component="h1" gutterBottom>
          Portfolio
        </Typography>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            {error || 'No portfolio data available'}
          </Typography>
          {error ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Please try again later.
            </Typography>
          ) : null}
          <Button variant="contained" href="/dashboard/wallet" sx={{ mt: 3 }}>
            Open Wallet Setup
          </Button>
        </Paper>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Portfolio
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Wallet Balance
          </Typography>
          <Typography variant="h4" color="primary">
            {snapshot.balanceSol.toFixed(2)} SOL
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ≈ ${snapshot.balanceUsd.toFixed(2)} · SOL ${snapshot.solUsd.toFixed(2)}
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Equity (USD)
          </Typography>
          <Typography variant="h4" color="primary">
            ${snapshot.equityUsd.toFixed(2)}
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Realized P/L
          </Typography>
          <Typography
            variant="h4"
            color={snapshot.realizedUsd >= 0 ? 'success.main' : 'error.main'}
          >
            {snapshot.realizedUsd >= 0 ? '+' : '-'}${Math.abs(snapshot.realizedUsd).toFixed(2)}
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Unrealized P/L
          </Typography>
          <Typography
            variant="h4"
            color={snapshot.unrealizedUsd >= 0 ? 'success.main' : 'error.main'}
          >
            {snapshot.unrealizedUsd >= 0 ? '+' : '-'}${Math.abs(snapshot.unrealizedUsd).toFixed(2)}
          </Typography>
        </Paper>
      </Box>

      {snapshot.positions.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Token</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Avg Cost (USD)</TableCell>
                <TableCell align="right">Price (USD)</TableCell>
                <TableCell align="right">MTM (USD)</TableCell>
                <TableCell align="right">P/L (USD)</TableCell>
                <TableCell align="right">P/L %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {snapshot.positions.map((position) => (
                <TableRow
                  key={position.mint}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/dashboard/tokens/${position.mint}`)}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 32, height: 32 }}>
                        {(position.symbol ?? position.mint).slice(0, 2).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {position.symbol ?? position.mint.slice(0, 4).toUpperCase()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {position.mint}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="right">{position.qty.toFixed(2)}</TableCell>
                  <TableCell align="right">${position.avgCostUsd.toFixed(6)}</TableCell>
                  <TableCell align="right">${position.priceUsd.toFixed(6)}</TableCell>
                  <TableCell align="right">${position.mtmUsd.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    <Typography color={position.pnlUsd >= 0 ? 'success.main' : 'error.main'}>
                      {position.pnlUsd >= 0 ? '+' : '-'}${Math.abs(position.pnlUsd).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={`${position.pnlPct >= 0 ? '+' : ''}${position.pnlPct.toFixed(2)}%`}
                      color={position.pnlPct >= 0 ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No positions yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Start trading to see your portfolio here
          </Typography>
        </Paper>
      )}
    </Container>
  )
}
