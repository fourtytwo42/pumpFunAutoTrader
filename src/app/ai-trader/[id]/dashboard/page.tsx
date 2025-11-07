import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { getDashboardSnapshot } from '@/lib/dashboard'
import { redirect } from 'next/navigation'
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
  Divider,
  Chip,
} from '@mui/material'
import { TrendingUp } from '@mui/icons-material'
import { OverviewCards } from '@/app/(dashboard)/dashboard/dashboard/components/OverviewCards'
import { ActiveOrdersCard } from '@/app/(dashboard)/dashboard/dashboard/components/ActiveOrdersCard'
import { RecentTradesCard } from '@/app/(dashboard)/dashboard/dashboard/components/RecentTradesCard'
import { AgentEventFeed } from '@/app/(dashboard)/dashboard/dashboard/components/AgentEventFeed'
import { formatDistanceToNow } from 'date-fns'

export default async function AiTraderDashboardPage({ params }: { params: { id: string } }) {
  const session = await requireAuth()

  // Verify this is an AI trader
  const aiTrader = await prisma.user.findFirst({
    where: {
      id: params.id,
      isAiAgent: true,
    },
    include: {
      aiConfig: true,
    },
  })

  if (!aiTrader || !aiTrader.aiConfig) {
    redirect('/dashboard/admin/ai-traders')
  }

  const snapshot = await getDashboardSnapshot(params.id)

  if (!snapshot) {
    return (
      <Container maxWidth="lg">
        <Typography variant="h5" color="error">
          Unable to load AI trader dashboard
        </Typography>
      </Container>
    )
  }

  const {
    wallet,
    positions,
    solUsd,
    portfolioValueSol,
    portfolioValueUsd,
    realizedUsd,
    unrealizedUsd,
    equityUsd,
    balanceSol,
    balanceUsd,
  } = snapshot

  const [initialOrdersRaw, initialTradesRaw, initialEventsRaw] = await Promise.all([
    prisma.order.findMany({
      where: {
        walletId: wallet.id,
        userId: params.id,
        status: {
          in: ['pending', 'open', 'accepted', 'queued'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.userTrade.findMany({
      where: { userId: params.id },
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
    balanceSol,
    balanceUsd,
    realizedUsd,
    unrealizedUsd,
    totalTrades: snapshot.totalTrades,
    totalTokens: snapshot.totalTokens,
    openOrders: snapshot.openOrders,
    solUsd,
    positions: positions.length,
  }

  const initialOrders = initialOrdersRaw.map((order) => ({
    id: order.id,
    side: order.side,
    tokenMint: order.tokenMint,
    status: order.status,
    qtySol: order.qtySol ? Number(order.qtySol) : null,
    qtyTokens: order.qtyTokens ? Number(order.qtyTokens) : null,
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
    side: trade.type === 1 ? ('buy' as const) : ('sell' as const),
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
    input: event.input,
    output: event.output,
  }))

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
        AI Trader Dashboard
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <OverviewCards initial={overviewInitial} />
        </Grid>

        <Grid item xs={12} md={6}>
          <ActiveOrdersCard initialOrders={initialOrders} walletId={wallet.id} />
        </Grid>

        <Grid item xs={12} md={6}>
          <AgentEventFeed initialEvents={initialEvents} walletId={wallet.id} />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Portfolio Summary
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Portfolio Value (SOL)
                </Typography>
                <Typography variant="h5" color="primary">
                  {portfolioValueSol.toFixed(4)} SOL
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ≈ ${portfolioValueUsd.toFixed(2)}
                </Typography>
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Button variant="contained" fullWidth component={Link} href={`/ai-trader/${params.id}/portfolio`}>
              View Full Portfolio
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Recent Trades
            </Typography>
            {initialTrades.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No trades recorded yet.
              </Typography>
            ) : (
              <Stack spacing={2} sx={{ mt: 2 }}>
                {initialTrades.map((trade) => {
                  const tradeDate = new Date(trade.ts)
                  const symbol = trade.tokenSymbol ?? trade.tokenMint.slice(0, 4).toUpperCase()
                  return (
                    <Box
                      key={trade.id}
                      component={Link}
                      href={`/dashboard/tokens/${trade.tokenMint}`}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'box-shadow 0.2s ease',
                        '&:hover': {
                          boxShadow: 4,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar>{symbol.slice(0, 2).toUpperCase()}</Avatar>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={trade.side.toUpperCase()}
                              color={trade.side === 'buy' ? 'success' : 'error'}
                              size="small"
                            />
                            <Typography variant="body2" fontWeight="bold">
                              {trade.tokenName ?? symbol}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {trade.baseAmount.toFixed(2)} @ {trade.priceSol.toFixed(8)} SOL
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" fontWeight="bold">
                          {trade.quoteSol.toFixed(4)} SOL
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDistanceToNow(tradeDate, { addSuffix: true })}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}
              </Stack>
            )}
            <Divider sx={{ my: 2 }} />
            <Button variant="contained" fullWidth component={Link} href={`/ai-trader/${params.id}/chat`}>
              Open Chat & Control
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}

