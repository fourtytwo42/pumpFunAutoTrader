'use client'

import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  Grid,
} from '@mui/material'
import {
  Add,
  PlayArrow,
  Stop,
  Delete,
  Refresh,
  Visibility,
} from '@mui/icons-material'
import { useRouter } from 'next/navigation'

interface AiTrader {
  id: string
  username: string
  configName: string
  strategyType: string
  isRunning: boolean
  startedAt: string | null
  lastActivityAt: string | null
  balance: number
  totalPnL: number
  positions: number
}

export default function AiTradersPage() {
  const router = useRouter()
  const [traders, setTraders] = useState<AiTrader[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    configName: '',
    strategyType: 'basic',
    initialBalance: 10,
  })

  useEffect(() => {
    fetchTraders()
  }, [])

  const fetchTraders = async () => {
    try {
      const response = await fetch('/api/admin/ai-traders')
      if (response.ok) {
        const data = await response.json()
        setTraders(data.traders || [])
      }
    } catch (error) {
      console.error('Error fetching AI traders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSpawn = async () => {
    try {
      const response = await fetch('/api/admin/ai-traders/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setOpenDialog(false)
        fetchTraders()
      }
    } catch (error) {
      console.error('Error spawning AI trader:', error)
    }
  }

  const handleStart = async (traderId: string) => {
    try {
      await fetch(`/api/admin/ai-traders/${traderId}/start`, { method: 'POST' })
      fetchTraders()
    } catch (error) {
      console.error('Error starting trader:', error)
    }
  }

  const handleStop = async (traderId: string) => {
    try {
      await fetch(`/api/admin/ai-traders/${traderId}/stop`, { method: 'POST' })
      fetchTraders()
    } catch (error) {
      console.error('Error stopping trader:', error)
    }
  }

  const handleDelete = async (traderId: string) => {
    if (!confirm('Are you sure you want to delete this AI trader?')) return
    try {
      await fetch(`/api/admin/ai-traders/${traderId}`, { method: 'DELETE' })
      fetchTraders()
    } catch (error) {
      console.error('Error deleting trader:', error)
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

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          AI Traders
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setOpenDialog(true)}>
          Spawn AI Trader
        </Button>
      </Box>

      {traders.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No AI Traders Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Spawn your first AI trader to start automated trading
          </Typography>
          <Button variant="contained" onClick={() => setOpenDialog(true)}>
            Spawn First AI Trader
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {traders.map((trader) => (
            <Grid item xs={12} md={6} lg={4} key={trader.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6">{trader.configName}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {trader.username}
                      </Typography>
                      <Chip
                        label={trader.isRunning ? 'Running' : 'Stopped'}
                        size="small"
                        color={trader.isRunning ? 'success' : 'default'}
                        sx={{ mt: 1 }}
                      />
                    </Box>
                    <Box>
                      <IconButton
                        size="small"
                        onClick={() => router.push(`/dashboard/admin/ai-traders/${trader.id}`)}
                        title="View Details"
                      >
                        <Visibility />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(trader.id)}
                        title="Delete"
                        color="error"
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Balance:
                      </Typography>
                      <Typography variant="body2">{trader.balance.toFixed(4)} SOL</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Total P/L:
                      </Typography>
                      <Typography
                        variant="body2"
                        color={trader.totalPnL >= 0 ? 'success.main' : 'error.main'}
                      >
                        {trader.totalPnL >= 0 ? '+' : ''}
                        {trader.totalPnL.toFixed(4)} SOL
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Positions:
                      </Typography>
                      <Typography variant="body2">{trader.positions}</Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {trader.isRunning ? (
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<Stop />}
                        onClick={() => handleStop(trader.id)}
                        fullWidth
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        variant="outlined"
                        color="success"
                        size="small"
                        startIcon={<PlayArrow />}
                        onClick={() => handleStart(trader.id)}
                        fullWidth
                      >
                        Start
                      </Button>
                    )}
                    <IconButton size="small" onClick={fetchTraders}>
                      <Refresh />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Spawn AI Trader</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              fullWidth
              label="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              helperText="Unique username for this AI trader"
            />
            <TextField
              fullWidth
              label="Config Name"
              value={formData.configName}
              onChange={(e) => setFormData({ ...formData, configName: e.target.value })}
              helperText="Descriptive name for this trader"
            />
            <TextField
              fullWidth
              label="Strategy Type"
              value={formData.strategyType}
              onChange={(e) => setFormData({ ...formData, strategyType: e.target.value })}
              helperText="Trading strategy identifier"
            />
            <TextField
              fullWidth
              label="Initial Balance (SOL)"
              type="number"
              value={formData.initialBalance}
              onChange={(e) =>
                setFormData({ ...formData, initialBalance: parseFloat(e.target.value) || 10 })
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSpawn} variant="contained">
            Spawn
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

