'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  IconButton,
  Chip,
  Stack,
  CircularProgress,
  Divider,
  Alert,
} from '@mui/material'
import {
  Send,
  Refresh,
  Psychology,
  ShoppingCart,
  Assessment,
  Code,
} from '@mui/icons-material'

interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  toolCall?: {
    name: string
    args: any
    result?: any
  }
}

interface AiTraderInfo {
  username: string
  configName: string
  themeColor: string
  llmProvider: string
  llmModel: string
  isRunning: boolean
}

export default function AiTraderChatPage() {
  const params = useParams<{ id: string }>()
  const [traderInfo, setTraderInfo] = useState<AiTraderInfo | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [debugMode, setDebugMode] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!params?.id) return
    
    // Fetch trader info
    fetch(`/api/admin/ai-traders/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setTraderInfo(data)
      })
      .catch((error) => {
        console.error('Failed to load trader info:', error)
      })
  }, [params?.id])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !params?.id) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setSending(true)

    try {
      const response = await fetch(`/api/ai-trader/${params.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      })

      if (response.ok) {
        const data = await response.json()
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, assistantMessage])

        // Log to console for debugging
        console.log('[AI Chat] User:', input)
        console.log('[AI Chat] Assistant:', data.response)
        if (data.toolCalls) {
          console.log('[AI Chat] Tool Calls:', data.toolCalls)
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  const handleTriggerAction = async (action: string) => {
    if (!params?.id) return

    console.log(`[AI Control] Triggering action: ${action}`)
    setSending(true)

    try {
      const response = await fetch(`/api/ai-trader/${params.id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[AI Control] ${action} result:`, data)

        // Add system message showing the action
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'system',
          content: `Triggered: ${action}`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, systemMessage])

        if (data.toolCalls) {
          data.toolCalls.forEach((toolCall: any) => {
            const toolMessage: ChatMessage = {
              id: `${Date.now()}_${toolCall.name}`,
              role: 'tool',
              content: `Tool: ${toolCall.name}`,
              timestamp: Date.now(),
              toolCall,
            }
            setMessages((prev) => [...prev, toolMessage])
            console.log('[AI Tool Call]', toolCall)
          })
        }

        if (data.response) {
          const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.response,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, assistantMessage])
        }
      }
    } catch (error) {
      console.error(`Failed to trigger ${action}:`, error)
    } finally {
      setSending(false)
    }
  }

  if (!traderInfo) {
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
      <Typography variant="h4" component="h1" gutterBottom>
        Chat & Control Center
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>Status:</strong> {traderInfo.isRunning ? 'Running' : 'Stopped'} |{' '}
          <strong>Model:</strong> {traderInfo.llmProvider}/{traderInfo.llmModel}
        </Typography>
      </Alert>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Refresh />}
          onClick={() => handleTriggerAction('poll_market')}
          disabled={sending}
        >
          Poll Market Data
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Psychology />}
          onClick={() => handleTriggerAction('analyze_opportunities')}
          disabled={sending}
        >
          Analyze Opportunities
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ShoppingCart />}
          onClick={() => handleTriggerAction('execute_trades')}
          disabled={sending}
        >
          Execute Trades
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Assessment />}
          onClick={() => handleTriggerAction('review_portfolio')}
          disabled={sending}
        >
          Review Portfolio
        </Button>
        <Button
          variant={debugMode ? 'contained' : 'outlined'}
          size="small"
          startIcon={<Code />}
          onClick={() => setDebugMode(!debugMode)}
        >
          {debugMode ? 'Hide' : 'Show'} Debug
        </Button>
      </Box>

      <Paper sx={{ height: 600, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Typography variant="h6">AI Chat</Typography>
          <Typography variant="caption" color="text.secondary">
            Monitor AI activity and interact with the agent
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
          {messages.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="body2" color="text.secondary">
                No messages yet. Use the action buttons above to trigger AI actions, or send a message below.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {messages.map((message) => (
                <Box
                  key={message.id}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Chip
                      label={message.role.toUpperCase()}
                      size="small"
                      color={
                        message.role === 'user'
                          ? 'primary'
                          : message.role === 'assistant'
                            ? 'success'
                            : message.role === 'tool'
                              ? 'warning'
                              : 'default'
                      }
                    />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                  <Paper
                    sx={{
                      p: 2,
                      maxWidth: '80%',
                      backgroundColor:
                        message.role === 'user'
                          ? `${traderInfo.themeColor}20`
                          : message.role === 'tool'
                            ? '#2a2a2a'
                            : '#1a1a1a',
                      border:
                        message.role === 'user'
                          ? `1px solid ${traderInfo.themeColor}40`
                          : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {message.content}
                    </Typography>
                    {debugMode && message.toolCall && (
                      <Box sx={{ mt: 2, p: 1, backgroundColor: '#0a0a0a', borderRadius: 1 }}>
                        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
                          Tool Call: {message.toolCall.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{ fontSize: 10, overflow: 'auto' }}
                        >
                          {JSON.stringify(message.toolCall.args, null, 2)}
                        </Typography>
                        {message.toolCall.result && (
                          <>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="caption" color="success.main" sx={{ display: 'block', mb: 1 }}>
                              Result:
                            </Typography>
                            <Typography
                              variant="caption"
                              component="pre"
                              sx={{ fontSize: 10, overflow: 'auto' }}
                            >
                              {JSON.stringify(message.toolCall.result, null, 2)}
                            </Typography>
                          </>
                        )}
                      </Box>
                    )}
                  </Paper>
                </Box>
              ))}
            </Stack>
          )}
          <div ref={messagesEndRef} />
        </Box>

        <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              placeholder="Send a message to the AI trader..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={sending}
              size="small"
            />
            <IconButton onClick={handleSend} disabled={sending || !input.trim()} color="primary">
              {sending ? <CircularProgress size={24} /> : <Send />}
            </IconButton>
          </Box>
        </Box>
      </Paper>
    </Container>
  )
}

