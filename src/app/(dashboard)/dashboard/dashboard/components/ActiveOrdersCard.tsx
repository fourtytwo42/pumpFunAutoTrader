'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Paper,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Box,
  TableContainer,
  LinearProgress,
} from '@mui/material'
import { formatDistanceToNow } from 'date-fns'
import { useEventStream } from '@/hooks/useEventStream'

interface OrderRow {
  id: string
  tokenMint: string
  side: string
  status: string
  qtyTokens: number | null
  qtySol: number | null
  createdAt: string
  updatedAt: string
}

interface ActiveOrdersCardProps {
  walletId: string
  initialOrders: OrderRow[]
}

const REFRESH_INTERVAL_MS = 20_000

export function ActiveOrdersCard({ walletId, initialOrders }: ActiveOrdersCardProps) {
  const [orders, setOrders] = useState(initialOrders)
  const [loading, setLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/orders?walletId=${encodeURIComponent(walletId)}&status=active&limit=5`,
        { cache: 'no-store' }
      )
      if (!response.ok) {
        return
      }
      const data = await response.json()
      setOrders(data.orders ?? [])
    } catch (error) {
      console.error('Failed to refresh active orders', error)
    } finally {
      setLoading(false)
    }
  }, [walletId])

  useEventStream({
    'order:update': (payload: any) => {
      if (payload?.walletId && payload.walletId !== walletId) return
      fetchOrders()
    },
  })

  useEffect(() => {
    const interval = setInterval(fetchOrders, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchOrders])

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Active Orders</Typography>
        {loading ? <LinearProgress sx={{ width: 120 }} /> : null}
      </Box>

      {orders.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No active orders.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Token</TableCell>
                <TableCell align="right">Side</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Age</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => {
                const size =
                  order.qtySol != null
                    ? `${order.qtySol.toFixed(3)} SOL`
                    : order.qtyTokens != null
                      ? `${order.qtyTokens.toFixed(2)} tokens`
                      : '—'
                return (
                  <TableRow key={order.id}>
                    <TableCell>{order.tokenMint}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={order.side.toUpperCase()}
                        color={order.side.toLowerCase() === 'buy' ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">{size}</TableCell>
                    <TableCell>
                      <Chip label={order.status} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  )
}
