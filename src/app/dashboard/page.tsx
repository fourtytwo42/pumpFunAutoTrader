import { requireAuth } from '@/lib/middleware'
import { Container, Typography, Box, Paper, Grid, Card, CardContent, Button, Link } from '@mui/material'
import { getUserBalance, getUserPortfolio } from '@/lib/trading'
import { TrendingUp, AccountBalanceWallet, Science, ShowChart, Timeline } from '@mui/icons-material'
import { prisma } from '@/lib/db'

export default async function DashboardPage() {
  const session = await requireAuth()
  const [balance, portfolio] = await Promise.all([
    getUserBalance(session.user.id),
    getUserPortfolio(session.user.id),
  ])

  // Get recent tokens
  const recentTokens = await prisma.token.findMany({
    include: { price: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })

  // Get market stats
  const totalTokens = await prisma.token.count()
  const totalTrades = await prisma.trade.count()

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

  const portfolioValue = portfolio.reduce((sum, p) => {
    const currentValue = p.token.price ? p.amount * p.token.price.priceSol : 0
    return sum + currentValue
  }, 0)

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Welcome, {session.user.username}!
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    SOL Balance
                  </Typography>
                  <Typography variant="h4" color="primary">
                    {balance.toFixed(4)} SOL
                  </Typography>
                </Box>
                <AccountBalanceWallet sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
              </Box>
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
                    color={totalPnLUsd >= 0 ? 'success.main' : 'error.main'}
                  >
                    ${totalPnLUsd >= 0 ? '+' : ''}
                    {totalPnLUsd.toFixed(2)}
                  </Typography>
                </Box>
                <TrendingUp
                  sx={{
                    fontSize: 40,
                    color: totalPnLUsd >= 0 ? 'success.main' : 'error.main',
                    opacity: 0.7,
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Portfolio Value
                  </Typography>
                  <Typography variant="h4">
                    {portfolioValue.toFixed(4)} SOL
                  </Typography>
                </Box>
                <ShowChart sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
              </Box>
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
                  <Typography variant="h4">{portfolio.length}</Typography>
                </Box>
                <Timeline sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card
            component={Link}
            href="/dashboard/tokens"
            sx={{
              textDecoration: 'none',
              cursor: 'pointer',
              '&:hover': { boxShadow: 4 },
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TrendingUp sx={{ fontSize: 48, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">Browse Tokens</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Explore available tokens to trade
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card
            component={Link}
            href="/dashboard/portfolio"
            sx={{
              textDecoration: 'none',
              cursor: 'pointer',
              '&:hover': { boxShadow: 4 },
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <AccountBalanceWallet sx={{ fontSize: 48, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">View Portfolio</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Check your positions and P/L
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card
            component={Link}
            href="/dashboard/faucet"
            sx={{
              textDecoration: 'none',
              cursor: 'pointer',
              '&:hover': { boxShadow: 4 },
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Science sx={{ fontSize: 48, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">Get SOL</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Request SOL from the faucet
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Market Overview */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Market Overview
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Total Tokens:
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {totalTokens}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Total Trades:
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {totalTrades.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Your Positions:
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {portfolio.length}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
              component={Link}
              href="/dashboard/tokens"
            >
              Browse All Tokens
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Your Positions
            </Typography>
            {portfolio.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                {portfolio.slice(0, 5).map((p) => {
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
                        <Typography variant="body1" fontWeight="bold">
                          {p.token.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {p.amount.toFixed(2)} {p.token.symbol}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography
                          variant="body2"
                          color={pnl >= 0 ? 'success.main' : 'error.main'}
                          fontWeight="bold"
                        >
                          {pnl >= 0 ? '+' : ''}
                          {pnl.toFixed(4)} SOL
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {pnlPercent >= 0 ? '+' : ''}
                          {pnlPercent.toFixed(2)}%
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}
                {portfolio.length > 5 && (
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                    +{portfolio.length - 5} more positions
                  </Typography>
                )}
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  No positions yet
                </Typography>
                <Button
                  variant="outlined"
                  component={Link}
                  href="/dashboard/tokens"
                  sx={{ mt: 2 }}
                >
                  Start Trading
                </Button>
              </Box>
            )}
            <Button
              variant="outlined"
              fullWidth
              sx={{ mt: 2 }}
              component={Link}
              href="/dashboard/portfolio"
            >
              View Full Portfolio
            </Button>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Tokens */}
      {recentTokens.length > 0 && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Recent Tokens
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {recentTokens.map((token) => (
              <Grid item xs={6} sm={4} md={2} key={token.id}>
                <Card
                  component={Link}
                  href={`/dashboard/tokens/${token.mintAddress}`}
                  sx={{
                    textDecoration: 'none',
                    cursor: 'pointer',
                    '&:hover': { boxShadow: 4 },
                    p: 2,
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="body2" fontWeight="bold" noWrap>
                    {token.symbol}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {token.name}
                  </Typography>
                  {token.price && token.price.priceUsd > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                      ${(Number(token.price.priceUsd) * 1_000_000).toFixed(2)}/1M
                    </Typography>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}
    </Container>
  )
}
