import { requireAuth } from '@/lib/middleware'
import { Container, Typography, Box, Grid, Paper, Button, Link, Divider } from '@mui/material'
import { prisma } from '@/lib/db'
import { getDashboardSnapshot } from '@/lib/dashboard'
import { OverviewCards } from './components/OverviewCards'
import { ActiveOrdersCard } from './components/ActiveOrdersCard'
import { RecentTradesCard } from './components/RecentTradesCard'
import { AgentEventFeed } from './components/AgentEventFeed'

export default async function DashboardPage() {
  const session = await requireAuth()

  if (!session) {
    return null
  }

  const snapshot = await getDashboardSnapshot(session.user.id)
  if (!snapshot) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10 }}>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Setting up your simulation wallet...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This usually takes just a moment. If the page does not refresh automatically, try reloading.
          </Typography>
        </Box>
      </Container>
    )
  }

  const {
    wallet,
    solUsd,
    portfolioValueSol,
    portfolioValueUsd,
    realizedUsd,
    unrealizedUsd,
    totalTrades,
    totalTokens,
    openOrders,
    balanceSol,
    balanceUsd,
    positions,
  } = snapshot

  const [initialOrdersRaw, initialTradesRaw, initialEventsRaw] = await Promise.all([
    prisma.order.findMany({
      where: {
        walletId: wallet.id,
        userId: session.user.id,
        status: {
          in: ['pending', 'open', 'accepted', 'queued'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.userTrade.findMany({
      where: { userId: session.user.id },
      include: {
        token: {
          select: {
            mintAddress: true,
            symbol: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.agentEvent.findMany({
      where: { walletId: wallet.id },
      orderBy: { ts: 'desc' },
      take: 8,
    }),
  ])

  const recentPositions = positions.slice(0, 5)

  const overviewInitial = {
    walletId: wallet.id,
    equityUsd: snapshot.equityUsd,
    portfolioValueSol,
    portfolioValueUsd,
    realizedUsd,
    unrealizedUsd,
    solUsd,
    totalTrades,
    positions: positions.length,
    openOrders,
    balanceSol,
    balanceUsd,
  }

  const initialOrders = initialOrdersRaw.map((order) => ({
    id: order.id,
    tokenMint: order.tokenMint,
    side: order.side,
    status: order.status,
    qtyTokens: order.qtyTokens ? Number(order.qtyTokens) : null,
    qtySol: order.qtySol ? Number(order.qtySol) : null,
    limitPriceSol: order.limitPriceSol ? Number(order.limitPriceSol) : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }))

  const initialTrades = initialTradesRaw.map((trade) => ({
    id: trade.id.toString(),
    ts: trade.createdAt.toISOString(),
    tokenMint: trade.token.mintAddress,
    tokenSymbol: trade.token.symbol,
    tokenName: trade.token.name,
    side: trade.type === 1 ? 'buy' as const : 'sell' as const,
    baseAmount: Number(trade.amountTokens),
    quoteSol: Number(trade.amountSol),
    priceUsd: null,
    priceSol: Number(trade.priceSol),
    txSig: null,
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
          Wallet: {wallet.label ?? wallet.pubkey} · Balance: {balanceSol.toFixed(2)} SOL
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
        <Grid item xs={12}>
          <RecentTradesCard walletId={wallet.id} initialTrades={initialTrades} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6} lg={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Market Overview
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Wallet Balance
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {balanceSol.toFixed(2)} SOL
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                ≈ ${balanceUsd.toFixed(2)}
              </Typography>
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
                  Portfolio Value (USD)
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  ${portfolioValueUsd.toFixed(2)}
                </Typography>
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Button
              variant="contained"
              fullWidth
              component={Link}
              href="/dashboard/portfolio"
            >
              View Full Portfolio
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}
