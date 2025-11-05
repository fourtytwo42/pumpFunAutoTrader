'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Container,
  Typography,
  Box,
  Paper,
  Avatar,
  Button,
  TextField,
  Grid,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material'
import { ShoppingCart, Sell } from '@mui/icons-material'
import { useSession } from 'next-auth/react'
import PriceChart from '@/components/charts/PriceChart'
import VolumeChart from '@/components/charts/VolumeChart'

interface TokenData {
  id: string
  mintAddress: string
  symbol: string
  name: string
  imageUri: string | null
  price: { priceSol: number; priceUsd: number } | null
  stats: {
    buyVolume: number
    sellVolume: number
    totalVolume: number
    uniqueTraders: number
    totalTrades: number
  }
  recentTrades: Array<{
    type: 'buy' | 'sell'
    amountSol: number
    amountUsd: number
    timestamp: string
  }>
}

export default function TokenDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const mintAddress = params.mintAddress as string

  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [buyAmount, setBuyAmount] = useState('')
  const [sellAmount, setSellAmount] = useState('')
  const [trading, setTrading] = useState(false)
  const [tradeSuccess, setTradeSuccess] = useState('')

  useEffect(() => {
    fetchToken()
  }, [mintAddress])

  const fetchToken = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tokens/${mintAddress}`)
      if (!response.ok) {
        throw new Error('Token not found')
      }
      const data = await response.json()
      setToken(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBuy = async () => {
    if (!buyAmount || parseFloat(buyAmount) <= 0) return
    setTrading(true)
    setTradeSuccess('')
    setError('')

    try {
      const response = await fetch('/api/trading/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: token?.id,
          amountSol: parseFloat(buyAmount),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Buy failed')
      }

      setTradeSuccess(`Bought ${data.tokensReceived?.toFixed(2)} tokens!`)
      setBuyAmount('')
      fetchToken()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setTrading(false)
    }
  }

  const handleSell = async () => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) return
    setTrading(true)
    setTradeSuccess('')
    setError('')

    try {
      const response = await fetch('/api/trading/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: token?.id,
          amountTokens: parseFloat(sellAmount),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Sell failed')
      }

      setTradeSuccess(`Sold for ${data.solReceived?.toFixed(4)} SOL!`)
      setSellAmount('')
      fetchToken()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setTrading(false)
    }
  }

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            p: 8,
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <CircularProgress size={48} sx={{ color: '#00ff88' }} />
          <Typography variant="body2" color="text.secondary">
            Loading token data...
          </Typography>
        </Box>
      </Container>
    )
  }

  if (error && !token) {
    return (
      <Container maxWidth="lg">
        <Alert
          severity="error"
          sx={{
            mt: 2,
            backgroundColor: '#1a1a1a',
            border: '1px solid #ff4444',
            color: '#ff4444',
          }}
        >
          {error}
        </Alert>
      </Container>
    )
  }

  if (!token) return null

  return (
    <Container maxWidth="lg">
      <Button onClick={() => router.back()} sx={{ mb: 2 }}>
        ← Back
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <Avatar src={token.imageUri || undefined} sx={{ width: 64, height: 64 }}>
          {token.symbol.charAt(0)}
        </Avatar>
        <Box>
          <Typography variant="h4">{token.name}</Typography>
          <Typography variant="h6" color="text.secondary">
            {token.symbol} • {token.mintAddress}
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {tradeSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setTradeSuccess('')}>
          {tradeSuccess}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Price Information
            </Typography>
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 3 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Price (SOL)
                </Typography>
                <Typography variant="h5">
                  {token.price ? token.price.priceSol.toFixed(8) : 'N/A'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Price (USD)
                </Typography>
                <Typography variant="h5">
                  {token.price ? `$${token.price.priceUsd.toFixed(4)}` : 'N/A'}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ mb: 2 }}>
              <PriceChart tokenAddress={token.mintAddress} height={300} />
            </Box>
            <Box>
              <VolumeChart tokenAddress={token.mintAddress} height={150} />
            </Box>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
              <Tab label="Trades" />
              <Tab label="Info" />
            </Tabs>

            {activeTab === 0 && (
              <TableContainer sx={{ mt: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Amount (SOL)</TableCell>
                      <TableCell>Amount (USD)</TableCell>
                      <TableCell>Time</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {token.recentTrades.map((trade, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Chip
                            label={trade.type.toUpperCase()}
                            color={trade.type === 'buy' ? 'success' : 'error'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{trade.amountSol.toFixed(4)}</TableCell>
                        <TableCell>${trade.amountUsd.toFixed(2)}</TableCell>
                        <TableCell>
                          {new Date(parseInt(trade.timestamp)).toLocaleTimeString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {activeTab === 1 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body1" gutterBottom>
                  <strong>Total Volume:</strong> ${token.stats.totalVolume.toFixed(2)}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  <strong>Buy Volume:</strong> ${token.stats.buyVolume.toFixed(2)}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  <strong>Sell Volume:</strong> ${token.stats.sellVolume.toFixed(2)}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  <strong>Unique Traders:</strong> {token.stats.uniqueTraders}
                </Typography>
                <Typography variant="body1">
                  <strong>Total Trades:</strong> {token.stats.totalTrades}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Buy
            </Typography>
            <TextField
              fullWidth
              label="Amount (SOL)"
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              fullWidth
              variant="contained"
              color="success"
              startIcon={<ShoppingCart />}
              onClick={handleBuy}
              disabled={trading || !buyAmount}
            >
              {trading ? 'Buying...' : 'Buy'}
            </Button>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Sell
            </Typography>
            <TextField
              fullWidth
              label="Amount (Tokens)"
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              fullWidth
              variant="contained"
              color="error"
              startIcon={<Sell />}
              onClick={handleSell}
              disabled={trading || !sellAmount}
            >
              {trading ? 'Selling...' : 'Sell'}
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}

