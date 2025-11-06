import { requireAuth } from '@/lib/middleware'
import {
  Container,
  Typography,
  Box,
  Grid,
  Paper,
  Button,
  Link,
  Avatar,
  Stack,
  Chip,
  Divider,
} from '@mui/material'
import { TrendingUp } from '@mui/icons-material'
import { prisma } from '@/lib/db'
import { getDashboardSnapshot } from '@/lib/dashboard'
import { OverviewCards } from './components/OverviewCards'
import { ActiveOrdersCard } from './components/ActiveOrdersCard'
import { RecentTradesCard } from './components/RecentTradesCard'
import { AgentEventFeed } from './components/AgentEventFeed'
import { formatDistanceToNow } from 'date-fns'

export default async function DashboardPage() {
  await requireAuth()

  const snapshot = await getDashboardSnapshot()
  if (!snapshot) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10 }}>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Configure a wallet to begin monitoring activity.
          </Typography>
          <Button
            component={Link}
            href="/dashboard/wallet"
            variant="contained"
            sx={{ mt: 3 }}
          >
            Open Wallet Setup
          </Button>
        </Box>
      </Container>
    )
  }

  const { wallet, solUsd, portfolioValueSol, realizedUsd, unrealizedUsd, totalTrades, totalTokens, openOrders } =
    snapshot

  const [initialOrdersRaw, initialTradesRaw, initialEventsRaw, recentPositions] = await Promise.all([
    prisma.order.findMany({
      where: {
        walletId: wallet.id,
        status: {
          in: ['pending', 'open', 'accepted', 'queued'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.tradeTape.findMany({
      where: { walletId: wallet.id },
      orderBy: { ts: 'desc' },
      take: 5,
    }),
    prisma.agentEvent.findMany({
      where: { walletId: wallet.id },
      orderBy: { ts: 'desc' },
      take: 8,
    }),
    prisma.position.findMany({
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
    }),
  ])

  const overviewInitial = {
    walletId: wallet.id,
    equityUsd: realizedUsd + unrealizedUsd,
    portfolioValueSol,
    realizedUsd,
    unrealizedUsd,
    solUsd,
    totalTrades,
    positions: wallet.positions.length,
    openOrders,
  }

  const initialOrders = initialOrdersRaw.map((order) => ({
    id: order.id,
    tokenMint: order.tokenMint,
    side: order.side,
    status: order.status,
    qtyTokens: order.qtyTokens ? Number(order.qtyTokens) : null,
    qtySol: order.qtySol ? Number(order.qtySol) : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }))

  const initialTrades = initialTradesRaw.map((trade) => ({
    id: trade.id,
    ts: trade.ts.toISOString(),
    tokenMint: trade.tokenMint,
    side: trade.isBuy ? 'buy' as const : 'sell' as const,
    baseAmount: Number(trade.baseAmount),
    quoteSol: Number(trade.quoteSol),
    priceUsd: trade.priceUsd ? Number(trade.priceUsd) : null,
    priceSol: trade.priceSol ? Number(trade.priceSol) : null,
    txSig: trade.txSig,
  }))

  const initialEvents = initialEventsRaw.map((event) => ({
    id: event.id,
    ts: event.ts.toISOString(),
    kind: event.kind,
    level: event.level,
    tokenMint: event.tokenMint,
    rationale: event.rationale,
  }))

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Wallet: {wallet.label ?? wallet.pubkey}
        </Typography>
      </Box>

      <OverviewCards initial={overviewInitial} />

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={8}>
          <ActiveOrdersCard walletId={wallet.id} initialOrders={initialOrders} />
        </Grid>
        <Grid item xs={12} lg={4}>
          <AgentEventFeed walletId={wallet.id} initialEvents={initialEvents} />
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={8}>
          <RecentTradesCard walletId={wallet.id} initialTrades={initialTrades} />
        </Grid>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              <Button
                component={Link}
                href="/dashboard/tokens"
                variant="contained"
                color="primary"
              >
                Browse Tokens
              </Button>
              <Button component={Link} href="/dashboard/positions" variant="outlined">
                View Positions
              </Button>
              <Button component={Link} href="/dashboard/orders" variant="outlined">
                Manage Orders
              </Button>
              <Button component={Link} href="/dashboard/chat" variant="outlined">
                Open Chat
              </Button>
              <Button
                component={Link}
                href="/dashboard/alerts"
                variant="outlined"
                startIcon={<TrendingUp />}
              >
                Configure Alerts
              </Button>
            </Stack>
          </Paper>
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
                  Open Orders
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {openOrders}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Portfolio (USD)
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  ${(realizedUsd + unrealizedUsd).toFixed(2)}
                </Typography>
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Button
              variant="contained"
              fullWidth
              component={Link}
              href="/dashboard/positions"
            >
              View Full Portfolio
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Positions
            </Typography>
            {recentPositions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No active positions yet.
              </Typography>
            ) : (
              <Stack spacing={2} sx={{ mt: 2 }}>
                {recentPositions.map((position) => {
                  const qty = Number(position.qty)
                  const priceSol = position.token.price ? Number(position.token.price.priceSol) : 0
                  const mtmSol = qty * priceSol
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar>{position.tokenMint.slice(0, 2).toUpperCase()}</Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {position.token.name ?? position.tokenMint}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {qty.toFixed(2)} {position.token.symbol}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" color="text.secondary">
                          {mtmSol.toFixed(4)} SOL
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Updated {formatDistanceToNow(position.updatedAt, { addSuffix: true })}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}
