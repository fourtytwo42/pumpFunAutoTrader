'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Grid, Card, CardContent, Typography, Box } from '@mui/material'
import {
  AccountBalanceWallet,
  Timeline,
  TrendingUp,
  ShowChart,
} from '@mui/icons-material'
import { useEventStream } from '@/hooks/useEventStream'

interface OverviewSnapshot {
  walletId: string
  equityUsd: number
  portfolioValueSol: number
  portfolioValueUsd?: number
  realizedUsd: number
  unrealizedUsd: number
  solUsd: number
  totalTrades: number
  positions: number
  openOrders: number
  balanceSol?: number | null
  balanceUsd?: number | null
}

interface OverviewCardsProps {
  initial: OverviewSnapshot
}

const POLL_INTERVAL_MS = 15_000

export function OverviewCards({ initial }: OverviewCardsProps) {
  const [metrics, setMetrics] = useState(initial)

  const fetchOverview = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/dashboard/overview?walletId=${encodeURIComponent(initial.walletId)}`,
        { cache: 'no-store' }
      )
      if (!response.ok) return
      const data = await response.json()
      setMetrics((prev) => ({
        ...prev,
        ...data,
      }))
    } catch (error) {
      console.error('Failed to refresh dashboard overview', error)
    }
  }, [initial.walletId])

  useEventStream({
    'portfolio:update': (payload: any) => {
      if (payload?.walletId && payload.walletId !== initial.walletId) return
      fetchOverview()
    },
    'order:update': (payload: any) => {
      if (payload?.walletId && payload.walletId !== initial.walletId) return
      fetchOverview()
    },
  })

  useEffect(() => {
    const interval = setInterval(fetchOverview, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchOverview])

  const totalPnlUsd = useMemo(
    () => metrics.realizedUsd + metrics.unrealizedUsd,
    [metrics.realizedUsd, metrics.unrealizedUsd]
  )

  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Portfolio (SOL)
                </Typography>
                <Typography variant="h4" color="primary">
                  {metrics.portfolioValueSol.toFixed(3)} SOL
                </Typography>
              </Box>
              <AccountBalanceWallet sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
            </Box>
            <Typography variant="caption" color="text.secondary" display="block">
              SOL ${metrics.solUsd.toFixed(2)}
            </Typography>
            {metrics.portfolioValueUsd != null ? (
              <Typography variant="caption" color="text.secondary" display="block">
                ≈ ${metrics.portfolioValueUsd.toFixed(2)}
              </Typography>
            ) : null}
            {metrics.balanceSol != null ? (
              <Typography variant="caption" color="text.secondary" display="block">
                Wallet {metrics.balanceSol.toFixed(2)} SOL
                {metrics.balanceUsd != null ? ` (~$${metrics.balanceUsd.toFixed(2)})` : ''}
              </Typography>
            ) : null}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total P/L
                </Typography>
                <Typography
                  variant="h4"
                  color={totalPnlUsd >= 0 ? 'success.main' : 'error.main'}
                >
                  {totalPnlUsd >= 0 ? '+' : '-'}${Math.abs(totalPnlUsd).toFixed(2)}
                </Typography>
              </Box>
              <TrendingUp
                sx={{
                  fontSize: 40,
                  color: totalPnlUsd >= 0 ? 'success.main' : 'error.main',
                  opacity: 0.7,
                }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Realized ${metrics.realizedUsd.toFixed(2)} · Unrealized ${metrics.unrealizedUsd.toFixed(2)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Open Orders
                </Typography>
                <Typography variant="h4">{metrics.openOrders}</Typography>
              </Box>
              <ShowChart sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {metrics.totalTrades} lifetime trades
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Active Positions
                </Typography>
                <Typography variant="h4">{metrics.positions}</Typography>
              </Box>
              <Timeline sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Equity ${metrics.equityUsd.toFixed(2)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}
