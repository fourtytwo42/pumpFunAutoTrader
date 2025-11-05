'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Chip,
  Button,
  Tabs,
  Tab,
} from '@mui/material'
import { ArrowBack } from '@mui/icons-material'

interface AiTraderDetail {
  id: string
  username: string
  configName: string
  strategyType: string
  isRunning: boolean
  balance: number
  totalPnL: number
  portfolio: Array<{
    token: { symbol: string; name: string }
    amount: number
    pnl: number
  }>
  recentTrades: Array<{
    type: string
    tokenSymbol: string
    amountSol: number
    timestamp: string
  }>
  logs: Array<{
    message: string
    logType: number
    timestamp: string
  }>
}

export default function AiTraderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const traderId = params.id as string

  const [trader, setTrader] = useState<AiTraderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    fetchTrader()
    const interval = setInterval(fetchTrader, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [traderId])

  const fetchTrader = async () => {
    try {
      const response = await fetch(`/api/admin/ai-traders/${traderId}`)
      if (response.ok) {
        const data = await response.json()
        setTrader(data)
      }
    } catch (error) {
      console.error('Error fetching trader:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !trader) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  if (!trader) return null

  return (
    <Container maxWidth="lg">
      <Button startIcon={<ArrowBack />} onClick={() => router.back()} sx={{ mb: 2 }}>
        Back
      </Button>

      <Typography variant="h4" component="h1" gutterBottom>
        {trader.configName}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {trader.username} • {trader.strategyType}
        <Chip
          label={trader.isRunning ? 'Running' : 'Stopped'}
          size="small"
          color={trader.isRunning ? 'success' : 'default'}
          sx={{ ml: 2 }}
        />
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Balance
              </Typography>
              <Typography variant="h4" color="primary">
                {trader.balance.toFixed(4)} SOL
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Total P/L
              </Typography>
              <Typography
                variant="h4"
                color={trader.totalPnL >= 0 ? 'success.main' : 'error.main'}
              >
                {trader.totalPnL >= 0 ? '+' : ''}
                {trader.totalPnL.toFixed(4)} SOL
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Positions
              </Typography>
              <Typography variant="h4">{trader.portfolio.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Portfolio" />
          <Tab label="Trades" />
          <Tab label="Logs" />
        </Tabs>

        {activeTab === 0 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Token</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">P/L</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trader.portfolio.map((pos, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {pos.token.name} ({pos.token.symbol})
                    </TableCell>
                    <TableCell align="right">{pos.amount.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      <Typography
                        color={pos.pnl >= 0 ? 'success.main' : 'error.main'}
                      >
                        {pos.pnl >= 0 ? '+' : ''}
                        {pos.pnl.toFixed(4)} SOL
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {activeTab === 1 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Token</TableCell>
                  <TableCell align="right">Amount (SOL)</TableCell>
                  <TableCell>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trader.recentTrades.map((trade, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Chip
                        label={trade.type.toUpperCase()}
                        size="small"
                        color={trade.type === 'buy' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell>{trade.tokenSymbol}</TableCell>
                    <TableCell align="right">{trade.amountSol.toFixed(4)}</TableCell>
                    <TableCell>
                      {new Date(trade.timestamp).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {activeTab === 2 && (
          <Box sx={{ p: 2, maxHeight: 600, overflow: 'auto' }}>
            {trader.logs.map((log, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1,
                  mb: 1,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {new Date(log.timestamp).toLocaleString()}
                </Typography>
                <Typography variant="body2">{log.message}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Container>
  )
}

