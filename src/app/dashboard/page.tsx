import { requireAuth } from '@/lib/middleware'
import { Container, Typography, Box, Paper } from '@mui/material'
import { getUserBalance, getUserPortfolio } from '@/lib/trading'

export default async function DashboardPage() {
  const session = await requireAuth()
  const [balance, portfolio] = await Promise.all([
    getUserBalance(session.user.id),
    getUserPortfolio(session.user.id),
  ])

  const totalPnL = portfolio.reduce((sum, p) => {
    const currentValue = p.token.price ? p.amount * p.token.price.priceSol : 0
    const costBasis = p.amount * p.avgBuyPrice
    return sum + (currentValue - costBasis)
  }, 0)

  const totalPnLUsd = portfolio.reduce((sum, p) => {
    const currentValue = p.token.price ? p.amount * p.token.price.priceUsd : 0
    const costBasis = p.amount * p.avgBuyPrice * (p.token.price?.priceUsd || 0) / (p.token.price?.priceSol || 1)
    return sum + (currentValue - costBasis)
  }, 0)

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome, {session.user.username}!
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            SOL Balance
          </Typography>
          <Typography variant="h4" color="primary">
            {balance.toFixed(2)} SOL
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Total P/L
          </Typography>
          <Typography
            variant="h4"
            color={totalPnLUsd >= 0 ? 'success.main' : 'error.main'}
          >
            ${totalPnLUsd >= 0 ? '+' : ''}
            {totalPnLUsd.toFixed(2)}
          </Typography>
        </Paper>

        <Paper sx={{ p: 3, flex: 1, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Active Positions
          </Typography>
          <Typography variant="h4">{portfolio.length}</Typography>
        </Paper>
      </Box>

      {portfolio.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Your Positions
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {portfolio.map((p) => {
              const currentValue = p.token.price ? p.amount * p.token.price.priceSol : 0
              const costBasis = p.amount * p.avgBuyPrice
              const pnl = currentValue - costBasis
              const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0

              return (
                <Box
                  key={p.tokenId}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    p: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Box>
                    <Typography variant="h6">{p.token.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {p.token.symbol} • {p.amount.toFixed(2)} tokens
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography
                      variant="h6"
                      color={pnl >= 0 ? 'success.main' : 'error.main'}
                    >
                      {pnl >= 0 ? '+' : ''}
                      {pnl.toFixed(4)} SOL ({pnlPercent.toFixed(2)}%)
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Avg: {p.avgBuyPrice.toFixed(8)} SOL
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Paper>
      )}
    </Container>
  )
}

