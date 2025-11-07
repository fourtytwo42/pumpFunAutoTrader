'use client'

import { useParams, useRouter } from 'next/navigation'
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
} from '@mui/material'

interface PortfolioPosition {
  mint: string
  symbol?: string | null
  qty: number
  avgCostUsd: number
  priceUsd: number
  mtmUsd: number
  pnlUsd: number
  pnlPct: number
}

interface TradeHistoryItem {
  mint: string
  symbol?: string | null
  name?: string | null
  totalBought: number
  totalSold: number
  remainingTokens: number
  avgBuyPriceSol: number
  realizedPnlUsd: number
  unrealizedPnlUsd: number
  totalPnlUsd: number
  tradeCount: number
  lastTradeAt: string
}

interface PortfolioSnapshot {
  walletId: string
  solUsd: number
  balanceSol: number
  balanceUsd: number
  equityUsd: number
  realizedUsd: number
  unrealizedUsd: number
  positions: PortfolioPosition[]
  tradeHistory: TradeHistoryItem[]
}

export default function AiTraderPortfolioPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!params?.id) return

    fetch(`/api/portfolio?userId=${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setSnapshot(data)
        setLoading(false)
      })
      .catch((error) => {
        console.error('Failed to load portfolio:', error)
        setLoading(false)
      })
  }, [params?.id])

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
        <Typography variant="h6" color="error">
          Failed to load portfolio
        </Typography>
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
          <Typography variant="h4" color={snapshot.realizedUsd >= 0 ? 'success.main' : 'error.main'}>
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

      {snapshot.positions.length > 0 && (
        <>
          <Typography variant="h5" gutterBottom sx={{ mt: 2 }}>
            Open Positions
          </Typography>
          <TableContainer component={Paper} sx={{ mb: 4 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Token</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Avg Cost (USD)</TableCell>
                  <TableCell align="right">Price (USD)</TableCell>
                  <TableCell align="right">MTM (USD)</TableCell>
                  <TableCell align="right">Unrealized P/L</TableCell>
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
        </>
      )}

      {snapshot.tradeHistory && snapshot.tradeHistory.length > 0 && (
        <>
          <Typography variant="h5" gutterBottom sx={{ mt: 2 }}>
            Trade History
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Token</TableCell>
                  <TableCell align="right">Trades</TableCell>
                  <TableCell align="right">Bought</TableCell>
                  <TableCell align="right">Sold</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                  <TableCell align="right">Realized P/L</TableCell>
                  <TableCell align="right">Unrealized P/L</TableCell>
                  <TableCell align="right">Total P/L</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshot.tradeHistory.map((item) => (
                  <TableRow
                    key={item.mint}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/dashboard/tokens/${item.mint}`)}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 32, height: 32 }}>
                          {(item.symbol ?? item.mint).slice(0, 2).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {item.symbol ?? item.mint.slice(0, 4).toUpperCase()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.name ?? item.mint}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right">{item.tradeCount}</TableCell>
                    <TableCell align="right">{item.totalBought.toFixed(2)}</TableCell>
                    <TableCell align="right">{item.totalSold.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      <Typography color={item.remainingTokens > 0 ? 'primary' : 'text.secondary'}>
                        {item.remainingTokens.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography color={item.realizedPnlUsd >= 0 ? 'success.main' : 'error.main'}>
                        {item.realizedPnlUsd >= 0 ? '+' : ''}${item.realizedPnlUsd.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography color={item.unrealizedPnlUsd >= 0 ? 'success.main' : 'error.main'}>
                        {item.unrealizedPnlUsd >= 0 ? '+' : ''}${item.unrealizedPnlUsd.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        fontWeight="bold"
                        color={item.totalPnlUsd >= 0 ? 'success.main' : 'error.main'}
                      >
                        {item.totalPnlUsd >= 0 ? '+' : ''}${item.totalPnlUsd.toFixed(2)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  )
}

