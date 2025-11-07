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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
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
  themeColor: string
  llmProvider: string
  llmModel: string
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
    themeColor: '#00ff88',
    llmProvider: 'openai' as 'openai' | 'anthropic' | 'groq' | 'mlstudio' | 'ollama',
    llmModel: '',
    llmApiKey: '',
    llmBaseUrl: '',
    temperature: 0.7,
    maxTokens: 1000,
    systemPrompt: '',
    // Risk profile settings
    maxPositionSizeUSD: 100,
    maxDailySpendUSD: 500,
    maxSlippageBps: 500,
    cooldownSeconds: 30,
    maxConcurrentPositions: 5,
    minLiquidityUSD: 1000,
  })
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [spawnedApiKey, setSpawnedApiKey] = useState<string | null>(null)
  const [spawnedEndpoint, setSpawnedEndpoint] = useState<string | null>(null)

  useEffect(() => {
    fetchTraders()
  }, [])

  const fetchModels = async () => {
    setLoadingModels(true)
    try {
      const params = new URLSearchParams({ provider: formData.llmProvider })
      if (formData.llmBaseUrl) params.set('baseUrl', formData.llmBaseUrl)
      if (formData.llmApiKey) params.set('apiKey', formData.llmApiKey)

      const response = await fetch(`/api/admin/llm/models?${params}`)
      if (response.ok) {
        const data = await response.json()
        setAvailableModels(data.models || [])
        if (data.models?.length > 0 && !formData.llmModel) {
          setFormData({ ...formData, llmModel: data.models[0] })
        }
      }
    } catch (error) {
      console.error('Error fetching models:', error)
    } finally {
      setLoadingModels(false)
    }
  }

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
        const data = await response.json()
        // Store API key to show user
        setSpawnedApiKey(data.apiKey)
        setSpawnedEndpoint(data.apiEndpoint)
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
              <Card
                sx={{
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  border: `2px solid ${trader.themeColor}40`,
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 24px ${trader.themeColor}30`,
                    borderColor: trader.themeColor,
                  },
                }}
                onClick={() => router.push(`/ai-trader/${trader.id}/dashboard`)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: trader.themeColor,
                            boxShadow: `0 0 8px ${trader.themeColor}`,
                          }}
                        />
                        <Typography variant="h6">{trader.configName}</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        @{trader.username}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {trader.llmProvider} · {trader.llmModel}
                      </Typography>
                      <Chip
                        label={trader.isRunning ? 'Running' : 'Stopped'}
                        size="small"
                        color={trader.isRunning ? 'success' : 'default'}
                        sx={{ mt: 1 }}
                      />
                    </Box>
                    <Box onClick={(e) => e.stopPropagation()}>
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Strategy:
                      </Typography>
                      <Typography variant="body2">{trader.strategyType}</Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }} onClick={(e) => e.stopPropagation()}>
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
                        size="small"
                        startIcon={<PlayArrow />}
                        onClick={() => handleStart(trader.id)}
                        fullWidth
                        sx={{
                          borderColor: trader.themeColor,
                          color: trader.themeColor,
                          '&:hover': {
                            borderColor: trader.themeColor,
                            backgroundColor: `${trader.themeColor}20`,
                          },
                        }}
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

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Spawn AI Trader</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <Typography variant="h6">Basic Configuration</Typography>
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
              helperText="Trading strategy identifier (e.g., momentum, contrarian, etc.)"
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

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Theme Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <input
                  type="color"
                  value={formData.themeColor}
                  onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                  style={{ width: 60, height: 40, border: 'none', cursor: 'pointer' }}
                />
                <TextField
                  label="Color Code"
                  value={formData.themeColor}
                  onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                  size="small"
                  sx={{ flexGrow: 1 }}
                />
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    backgroundColor: formData.themeColor,
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                />
              </Box>
              <FormHelperText>Choose a theme color for this AI trader&apos;s dashboard</FormHelperText>
            </Box>

            <Typography variant="h6" sx={{ mt: 2 }}>
              LLM Configuration
            </Typography>
            <FormControl fullWidth>
              <InputLabel>LLM Provider</InputLabel>
              <Select
                value={formData.llmProvider}
                label="LLM Provider"
                onChange={(e) => {
                  const provider = e.target.value as any
                  setFormData({ ...formData, llmProvider: provider, llmModel: '' })
                  setAvailableModels([])
                }}
              >
                <MenuItem value="openai">OpenAI</MenuItem>
                <MenuItem value="anthropic">Anthropic</MenuItem>
                <MenuItem value="groq">Groq</MenuItem>
                <MenuItem value="mlstudio">LM Studio</MenuItem>
                <MenuItem value="ollama">Ollama</MenuItem>
              </Select>
              <FormHelperText>Choose the LLM provider for this agent</FormHelperText>
            </FormControl>

            {(formData.llmProvider === 'mlstudio' || formData.llmProvider === 'ollama') && (
              <TextField
                fullWidth
                label="Base URL"
                value={formData.llmBaseUrl}
                onChange={(e) => setFormData({ ...formData, llmBaseUrl: e.target.value })}
                placeholder={
                  formData.llmProvider === 'mlstudio'
                    ? 'http://192.168.50.238:1234'
                    : 'http://localhost:11434'
                }
                helperText={`${formData.llmProvider === 'mlstudio' ? 'LM Studio' : 'Ollama'} server URL (without /v1)`}
              />
            )}

            {(formData.llmProvider === 'openai' ||
              formData.llmProvider === 'anthropic' ||
              formData.llmProvider === 'groq') && (
              <TextField
                fullWidth
                label="API Key"
                value={formData.llmApiKey}
                onChange={(e) => setFormData({ ...formData, llmApiKey: e.target.value })}
                placeholder="Enter API key or leave blank to use environment variable"
                helperText={`Optional: Leave blank to use ${formData.llmProvider.toUpperCase()}_API_KEY from .env`}
                type="password"
              />
            )}

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <FormControl fullWidth disabled={loadingModels}>
                <InputLabel>Model</InputLabel>
                <Select
                  value={formData.llmModel}
                  label="Model"
                  onChange={(e) => setFormData({ ...formData, llmModel: e.target.value })}
                >
                  {availableModels.map((model) => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {availableModels.length > 0
                    ? 'Select a model'
                    : 'Click "Load Models" to fetch available models'}
                </FormHelperText>
              </FormControl>
              <Button
                variant="outlined"
                onClick={fetchModels}
                disabled={loadingModels}
                sx={{ minWidth: 120 }}
              >
                {loadingModels ? <CircularProgress size={24} /> : 'Load Models'}
              </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Temperature"
                type="number"
                inputProps={{ min: 0, max: 2, step: 0.1 }}
                value={formData.temperature}
                onChange={(e) =>
                  setFormData({ ...formData, temperature: parseFloat(e.target.value) || 0.7 })
                }
                helperText="Controls randomness (0-2)"
              />
              <TextField
                fullWidth
                label="Max Tokens"
                type="number"
                inputProps={{ min: 100, max: 32000, step: 100 }}
                value={formData.maxTokens}
                onChange={(e) =>
                  setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 1000 })
                }
                helperText="Maximum response length"
              />
            </Box>

            <TextField
              fullWidth
              multiline
              rows={4}
              label="System Prompt"
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              placeholder="You are an AI trading agent that analyzes pump.fun tokens and makes informed trading decisions..."
              helperText="Define the AI agent's personality and trading approach"
            />

            <Typography variant="h6" sx={{ mt: 2 }}>
              Risk Profile
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Max Position Size (USD)"
                type="number"
                inputProps={{ min: 10, max: 10000, step: 10 }}
                value={formData.maxPositionSizeUSD}
                onChange={(e) =>
                  setFormData({ ...formData, maxPositionSizeUSD: parseFloat(e.target.value) || 100 })
                }
                helperText="Maximum USD value per position"
              />
              <TextField
                fullWidth
                label="Max Daily Spend (USD)"
                type="number"
                inputProps={{ min: 50, max: 50000, step: 50 }}
                value={formData.maxDailySpendUSD}
                onChange={(e) =>
                  setFormData({ ...formData, maxDailySpendUSD: parseFloat(e.target.value) || 500 })
                }
                helperText="Maximum daily trading volume"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Max Slippage (bps)"
                type="number"
                inputProps={{ min: 10, max: 2000, step: 10 }}
                value={formData.maxSlippageBps}
                onChange={(e) =>
                  setFormData({ ...formData, maxSlippageBps: parseInt(e.target.value) || 500 })
                }
                helperText="Max allowed slippage (500 = 5%)"
              />
              <TextField
                fullWidth
                label="Cooldown (seconds)"
                type="number"
                inputProps={{ min: 0, max: 600, step: 5 }}
                value={formData.cooldownSeconds}
                onChange={(e) =>
                  setFormData({ ...formData, cooldownSeconds: parseInt(e.target.value) || 30 })
                }
                helperText="Time between trades"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Max Concurrent Positions"
                type="number"
                inputProps={{ min: 1, max: 20, step: 1 }}
                value={formData.maxConcurrentPositions}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxConcurrentPositions: parseInt(e.target.value) || 5,
                  })
                }
                helperText="Max open positions at once"
              />
              <TextField
                fullWidth
                label="Min Liquidity (USD)"
                type="number"
                inputProps={{ min: 100, max: 100000, step: 100 }}
                value={formData.minLiquidityUSD}
                onChange={(e) =>
                  setFormData({ ...formData, minLiquidityUSD: parseFloat(e.target.value) || 1000 })
                }
                helperText="Minimum market liquidity required"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={handleSpawn}
            variant="contained"
            disabled={
              !formData.username ||
              !formData.configName ||
              !formData.llmProvider ||
              !formData.llmModel
            }
          >
            Spawn
          </Button>
        </DialogActions>
      </Dialog>

      {/* API Key Display Dialog */}
      <Dialog 
        open={!!spawnedApiKey} 
        onClose={() => setSpawnedApiKey(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>AI Trader Created Successfully! 🎉</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" paragraph>
              Your AI trader has been spawned. Below is the API key for external access.
            </Typography>
            <Typography variant="body2" color="warning.main" paragraph>
              ⚠️ IMPORTANT: Save this API key now! It will not be shown again.
            </Typography>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              API Endpoint:
            </Typography>
            <TextField
              fullWidth
              value={spawnedEndpoint || ''}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              API Key:
            </Typography>
            <TextField
              fullWidth
              value={spawnedApiKey || ''}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </Box>

          <Box sx={{ p: 2, bgcolor: 'grey.900', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Example Usage (curl):
            </Typography>
            <pre style={{ 
              margin: 0, 
              fontSize: '0.75rem', 
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
{`curl -X POST ${spawnedEndpoint || ''} \\
  -H "X-API-Key: ${spawnedApiKey || ''}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "get_trending_tokens",
    "arguments": {
      "sortBy": "volume",
      "timeframe": "1h",
      "limit": 5
    }
  }'`}
            </pre>
          </Box>

          <Box sx={{ mt: 2, p: 2, bgcolor: 'info.dark', borderRadius: 1 }}>
            <Typography variant="body2">
              📚 <strong>Documentation:</strong> Use GET {spawnedEndpoint} to list all available tools.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              navigator.clipboard.writeText(spawnedApiKey || '')
              alert('API Key copied to clipboard!')
            }}
            variant="outlined"
          >
            Copy API Key
          </Button>
          <Button 
            onClick={() => setSpawnedApiKey(null)} 
            variant="contained"
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

