import { requireAdminOrPowerUser } from '@/lib/middleware'
import Link from 'next/link'
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Button,
  Divider,
  Stack,
} from '@mui/material'
import { People, SmartToy } from '@mui/icons-material'
import { listAdminAiTraders } from '@/lib/admin/ai-traders'
import { prisma } from '@/lib/db'
import { SmtpSettingsCard } from './components/SmtpSettingsCard'

export default async function AdminPage() {
  const session = await requireAdminOrPowerUser()
  if (!session) {
    return null
  }

  const isAdmin = session.user.role === 'admin'
  let aiTraders: Awaited<ReturnType<typeof listAdminAiTraders>>
  try {
    aiTraders = await listAdminAiTraders()
  } catch (error) {
    console.error('[admin] Failed to list AI traders', error)
    throw error
  }
  let smtpConfigRecord
  try {
    smtpConfigRecord = await prisma.smtpConfig.findUnique({
      where: { id: 'primary' },
    })
  } catch (error) {
    console.error('[admin] Failed to fetch SMTP config', error)
    throw error
  }
  const smtpConfig = smtpConfigRecord
    ? {
        host: smtpConfigRecord.host,
        port: smtpConfigRecord.port,
        secure: smtpConfigRecord.secure,
        username: smtpConfigRecord.username,
        fromEmail: smtpConfigRecord.fromEmail,
        fromName: smtpConfigRecord.fromName,
        hasPassword: Boolean(smtpConfigRecord.password),
        lastTestAt: smtpConfigRecord.lastTestAt
          ? smtpConfigRecord.lastTestAt.toISOString()
          : null,
        lastTestStatus: smtpConfigRecord.lastTestStatus ?? null,
        lastTestError: smtpConfigRecord.lastTestError ?? null,
      }
    : null
  const totalAi = aiTraders.length
  const runningAi = aiTraders.filter((t) => t.isRunning).length
  const totalEquity = aiTraders.reduce((sum, trader) => sum + trader.equity, 0)
  const totalBalance = aiTraders.reduce((sum, trader) => sum + trader.balance, 0)
  const totalPortfolioValue = aiTraders.reduce((sum, trader) => sum + trader.portfolioValue, 0)

  const formatSol = (value: number, digits = 2) => `${value.toFixed(digits)} SOL`

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Admin Panel
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome, {session.user.username} ({session.user.role})
      </Typography>

      <Grid container spacing={3}>
        {isAdmin && (
          <Grid item xs={12} md={6}>
            <Paper
              component={Link}
              href="/dashboard/admin/users"
              sx={{
                p: 3,
                cursor: 'pointer',
                textDecoration: 'none',
                color: 'inherit',
                display: 'block',
                '&:hover': { boxShadow: 4 },
              }}
            >
              <People sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                User Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create, edit, and manage user accounts
              </Typography>
            </Paper>
          </Grid>
        )}

        <Grid item xs={12} md={isAdmin ? 6 : 12}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SmartToy sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6">AI Management</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Monitor all AI agents, balances, and activity in one place
                  </Typography>
                </Box>
              </Box>
              <Button component={Link} href="/dashboard/admin/ai-traders" variant="outlined">
                Manage AI Traders
              </Button>
            </Box>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total AI Agents
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {totalAi}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Active Agents
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {runningAi}/{totalAi}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total Equity (SOL)
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {formatSol(totalEquity, 2)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Wallet Cash (SOL)
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {formatSol(totalBalance, 2)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            <Divider sx={{ mb: 2 }} />

            {aiTraders.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No AI traders have been created yet.
                </Typography>
                <Button component={Link} href="/dashboard/admin/ai-traders" variant="contained">
                  Spawn Your First AI Trader
                </Button>
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Agent</TableCell>
                      <TableCell>Wallet</TableCell>
                      <TableCell>Portfolio</TableCell>
                      <TableCell>Equity</TableCell>
                      <TableCell>P/L</TableCell>
                      <TableCell align="center">Positions</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {aiTraders.map((trader) => (
                      <TableRow hover key={trader.id}>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {trader.configName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              @{trader.username} · {trader.strategyType}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {trader.llmProvider} · {trader.llmModel}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{formatSol(trader.balance)}</TableCell>
                        <TableCell>{formatSol(trader.portfolioValue)}</TableCell>
                        <TableCell>{formatSol(trader.equity)}</TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color={trader.totalPnL >= 0 ? 'success.main' : 'error.main'}
                            sx={{ fontWeight: 600 }}
                          >
                            {trader.totalPnL >= 0 ? '+' : ''}
                            {trader.totalPnL.toFixed(2)} SOL
                          </Typography>
                        </TableCell>
                        <TableCell align="center">{trader.positions}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={trader.isRunning ? 'Running' : 'Stopped'}
                            color={trader.isRunning ? 'success' : 'default'}
                            sx={{ fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            component={Link}
                            href={`/ai-trader/${trader.id}/dashboard`}
                            variant="outlined"
                            size="small"
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}

            {totalPortfolioValue > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                Totals include wallet balances and marked-to-market portfolio values.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid item xs={12}>
          <SmtpSettingsCard initialConfig={smtpConfig} />
        </Grid>
      </Grid>
    </Container>
  )
}

