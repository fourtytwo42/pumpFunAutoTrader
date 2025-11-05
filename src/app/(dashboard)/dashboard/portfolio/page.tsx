'use client'

import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Avatar,
  Chip,
} from '@mui/material'
import { useRouter } from 'next/navigation'

interface PortfolioPosition {
  tokenId: string
  token: {
    mintAddress: string
    symbol: string
    name: string
    imageUri: string | null
    price: { priceSol: number; priceUsd: number } | null
  }
  amount: number
  avgBuyPrice: number
  currentValue: number
  costBasis: number
  pnl: number
  pnlPercent: number
}

interface PortfolioData {
  balance: number
  portfolio: PortfolioPosition[]
  totalPnL: number
}

export default function PortfolioPage() {
  const router = useRouter()
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPortfolio()
  }, [])

  const fetchPortfolio = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/portfolio')
      const portfolioData = await response.json()
      setData(portfolioData)
    } catch (error) {
      console.error('Error fetching portfolio:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    )
  }

  if (!data) return null

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Portfolio
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            SOL Balance
          </Typography>
          <Typography variant="h4" color="primary">
            {data.balance.toFixed(4)} SOL
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Total P/L
          </Typography>
          <Typography
            variant="h4"
            color={data.totalPnL >= 0 ? 'success.main' : 'error.main'}
          >
            {data.totalPnL >= 0 ? '+' : ''}
            {data.totalPnL.toFixed(4)} SOL
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Positions
          </Typography>
          <Typography variant="h4">{data.portfolio.length}</Typography>
        </Paper>
      </Box>

      {data.portfolio.length > 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Token</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Avg Buy Price</TableCell>
                <TableCell align="right">Current Price</TableCell>
                <TableCell align="right">Current Value</TableCell>
                <TableCell align="right">P/L</TableCell>
                <TableCell align="right">P/L %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.portfolio.map((position) => (
                <TableRow
                  key={position.tokenId}
                  sx={{ cursor: 'pointer' }}
                  onClick={() =>
                    router.push(`/dashboard/tokens/${position.token.mintAddress}`)
                  }
                  hover
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar
                        src={position.token.imageUri || undefined}
                        sx={{ width: 32, height: 32 }}
                      >
                        {position.token.symbol.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2">{position.token.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {position.token.symbol}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="right">{position.amount.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    {position.avgBuyPrice.toFixed(8)} SOL
                  </TableCell>
                  <TableCell align="right">
                    {position.token.price
                      ? `${position.token.price.priceSol.toFixed(8)} SOL`
                      : 'N/A'}
                  </TableCell>
                  <TableCell align="right">
                    {position.currentValue.toFixed(4)} SOL
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      color={position.pnl >= 0 ? 'success.main' : 'error.main'}
                    >
                      {position.pnl >= 0 ? '+' : ''}
                      {position.pnl.toFixed(4)} SOL
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={`${position.pnl >= 0 ? '+' : ''}${position.pnlPercent.toFixed(2)}%`}
                      color={position.pnl >= 0 ? 'success' : 'error'}
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

