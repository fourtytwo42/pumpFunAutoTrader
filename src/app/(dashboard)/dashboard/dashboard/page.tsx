import { requireAuth } from '@/lib/middleware'
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Link,
} from '@mui/material'
import {
  TrendingUp,
  AccountBalanceWallet,
  Science,
  ShowChart,
  Timeline,
} from '@mui/icons-material'
import { prisma } from '@/lib/db'
import { getDashboardSnapshot } from '@/lib/dashboard'

export default async function DashboardPage() {
  const session = await requireAuth()
  const snapshot = await getDashboardSnapshot()

  if (!session) {
    return null
  }

  if (!snapshot) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10 }}>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Welcome, {session.user.username}! Configure a wallet to begin monitoring activity.
          </Typography>
        </Box>
      </Container>
    )
  }

  const { wallet, solUsd, portfolioValueSol, realizedUsd, unrealizedUsd, totalTrades, totalTokens } =
    snapshot

  const recentPositions = await prisma.position.findMany({
    where: { walletId: wallet.id },
    include: {
      token: {
        include: {
          price: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })

  const formatCurrency = (value: number) =>
    `${value >= 0 ? '+' : ''}${value.toFixed(2)}`

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
                    {portfolioValueSol.toFixed(3)} SOL
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
                    Realized P/L
                  </Typography>
                  <Typography
                    variant="h4"
                    color={realizedUsd >= 0 ? 'success.main' : 'error.main'}
                  >
                    ${formatCurrency(realizedUsd)}
                  </Typography>
                </Box>
                <TrendingUp
                  sx={{
                    fontSize: 40,
                    color: realizedUsd >= 0 ? 'success.main' : 'error.main',
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
                    Unrealized P/L
                  </Typography>
                  <Typography
                    variant="h4"
                    color={unrealizedUsd >= 0 ? 'success.main' : 'error.main'}
                  >
                    ${formatCurrency(unrealizedUsd)}
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
                  <Typography variant="h4">{totalTokens}</Typography>
                </Box>
                <Timeline sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card component={Link} href="/dashboard/tokens" sx={{ textDecoration: 'none', '&:hover': { boxShadow: 4 } }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TrendingUp sx={{ fontSize: 48, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">Browse Tokens</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Explore discovery watchlist
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card component={Link} href="/dashboard/positions" sx={{ textDecoration: 'none', '&:hover': { boxShadow: 4 } }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <AccountBalanceWallet sx={{ fontSize: 48, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">View Positions</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Drill into MTM and flows
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card component={Link} href="/dashboard/faucet" sx={{ textDecoration: 'none', '&:hover': { boxShadow: 4 } }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Science sx={{ fontSize: 48, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">Risk Controls</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure risk limits and alerts
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Market Overview
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Total Positions
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {totalTokens}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Total Trades
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {totalTrades}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  SOL Price
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  ${solUsd.toFixed(2)}
                </Typography>
              </Box>
            </Box>
            <Button variant="contained" fullWidth sx={{ mt: 2 }} component={Link} href="/dashboard/positions">
              View Positions
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Positions
            </Typography>
            {recentPositions.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                {recentPositions.map((position) => {
                  const priceSol = position.token.price ? Number(position.token.price.priceSol) : 0
                  const qty = Number(position.qty)
                  const mtmSol = priceSol * qty

                  return (
                    <Box
                      key={position.id}
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
                          {position.token.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {qty.toFixed(2)} {position.token.symbol}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" color="text.secondary">
                          {mtmSol.toFixed(4)} SOL
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Updated {position.updatedAt.toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No active positions yet.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}
