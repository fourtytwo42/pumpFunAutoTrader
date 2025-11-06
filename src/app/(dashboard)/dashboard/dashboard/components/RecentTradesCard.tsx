'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Box,
} from '@mui/material'
import { formatDistanceToNow } from 'date-fns'
import { useEventStream } from '@/hooks/useEventStream'

interface TradeRow {
  id: string
  ts: string
  tokenMint: string
  side: 'buy' | 'sell'
  baseAmount: number
  quoteSol: number
  priceUsd: number | null
  priceSol: number | null
  txSig: string | null
}

interface RecentTradesCardProps {
  walletId: string
  initialTrades: TradeRow[]
}

const REFRESH_INTERVAL_MS = 30_000

export function RecentTradesCard({ walletId, initialTrades }: RecentTradesCardProps) {
  const [trades, setTrades] = useState(initialTrades)

  const fetchTrades = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/trades?walletId=${encodeURIComponent(walletId)}&limit=5`,
        { cache: 'no-store' }
      )
      if (!response.ok) return
      const data = await response.json()
      setTrades(data.trades ?? [])
    } catch (error) {
      console.error('Failed to refresh trades', error)
    }
  }, [walletId])

  useEffect(() => {
    const interval = setInterval(fetchTrades, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchTrades])

  useEventStream({
    'trade:new': (payload: any) => {
      if (payload?.walletId && payload.walletId !== walletId) return
      fetchTrades()
    },
  })

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Recent Trades</Typography>
      </Box>

      {trades.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No trades recorded yet.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Token</TableCell>
                <TableCell align="right">Side</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell align="right">Price (SOL)</TableCell>
                <TableCell align="right">When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell>{trade.tokenMint}</TableCell>
                  <TableCell align="right">
                    <Chip
                      label={trade.side.toUpperCase()}
                      color={trade.side === 'buy' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">{trade.baseAmount.toFixed(2)} tokens</TableCell>
                  <TableCell align="right">
                    {trade.priceSol ? trade.priceSol.toFixed(6) : 'N/A'} SOL
                  </TableCell>
                  <TableCell align="right">
                    {formatDistanceToNow(new Date(trade.ts), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  )
}
