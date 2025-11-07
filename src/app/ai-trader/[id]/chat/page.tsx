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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import {
  Send,
  Refresh,
  Psychology,
  ShoppingCart,
  Assessment,
  Code,
  ClearAll,
  ExpandMore,
  Fullscreen,
  FullscreenExit,
} from '@mui/icons-material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  meta?: {
    status?: 'executing' | 'completed' | 'failed'
    toolName?: string
    result?: any
    error?: string
    [key: string]: any
  }
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

interface ToolInfo {
  name: string
  description: string
}

export default function AiTraderChatPage() {
  const params = useParams<{ id: string }>()
  const [traderInfo, setTraderInfo] = useState<AiTraderInfo | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [debugMode, setDebugMode] = useState(true)
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [currentUserName, setCurrentUserName] = useState<string>('You')

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

    // Fetch current user info
    fetch('/api/user/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.username) {
          setCurrentUserName(data.username)
        }
      })
      .catch((error) => {
        console.error('Failed to load user info:', error)
      })

    // Fetch chat history
    fetch(`/api/ai-trader/${params.id}/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages)
          console.log('[AI Chat] Loaded', data.messages.length, 'messages from history')
        }
      })
      .catch((error) => {
        console.error('Failed to load chat history:', error)
      })
  }, [params?.id])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Poll for new messages every 2 seconds (but not while sending)
  useEffect(() => {
    if (!params?.id || sending) return

    const interval = setInterval(async () => {
      if (sending) return // Skip polling while streaming

      try {
        const res = await fetch(`/api/ai-trader/${params.id}/messages`)
        if (res.ok) {
          const data = await res.json()
          if (data.messages && data.messages.length > messages.length) {
            setMessages(data.messages)
          }
        }
      } catch (error) {
        console.error('Failed to poll messages:', error)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [params?.id, messages.length, sending])

  const handleSend = async () => {
    if (!input.trim() || !params?.id) return

    const messageText = input
    setInput('')
    setSending(true)

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])

    // Create placeholder for AI response
    const aiMsgId = `ai-${Date.now()}`
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, aiMsg])

    try {
      const response = await fetch(`/api/ai-trader/${params.id}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      })

      if (!response.ok || !response.body) {
        throw new Error('Streaming not supported')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const toolCalls: Map<string, { status: string; result?: any }> = new Map()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue

          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'content' && event.content) {
              // Append to AI message (don't clean yet - wait for full response)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId ? { ...m, content: m.content + event.content } : m
                )
              )
            } else if (event.type === 'tool_start') {
              // Track tool execution in the AI message meta AND clean content
              toolCalls.set(event.tool, { status: 'running' })
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== aiMsgId) return m
                  
                  // Strip out tool syntax when tool detected
                  const cleanContent = m.content
                    .replace(/<\|start\|>/g, '')
                    .replace(/<\|channel\|>commentary\s+to=["']?(?:functions\.)?[\w]+["']?/g, '')
                    .replace(/<\|constrain\|>json/g, '')
                    .replace(/<\|message\|>\{[^}]*\}/g, '')
                    .trim()
                  
                  return {
                    ...m,
                    content: cleanContent,
                    meta: {
                      ...m.meta,
                      toolCalls: Array.from(toolCalls.entries()).map(([name, data]) => ({
                        name,
                        status: data.status,
                        result: data.result,
                      })),
                    },
                  }
                })
              )
            } else if (event.type === 'tool_complete') {
              // Update tool status to completed
              toolCalls.set(event.tool, { status: 'completed', result: event.result })
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        meta: {
                          ...m.meta,
                          toolCalls: Array.from(toolCalls.entries()).map(([name, data]) => ({
                            name,
                            status: data.status,
                            result: data.result,
                          })),
                        },
                      }
                    : m
                )
              )
            } else if (event.type === 'tool_error') {
              toolCalls.set(event.tool, { status: 'failed', result: { error: event.error } })
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                        ...m,
                        meta: {
                          ...m.meta,
                          toolCalls: Array.from(toolCalls.entries()).map(([name, data]) => ({
                            name,
                            status: data.status,
                            result: data.result,
                          })),
                        },
                      }
                    : m
                )
              )
            } else if (event.type === 'done') {
              console.log('[AI Chat] Stream complete')
            }
          } catch (e) {
            console.warn('Failed to parse SSE event:', line)
          }
        }
      }

      // Don't reload from DB - it would overwrite our streaming state
      // Messages are already saved by the streaming endpoint
    } catch (error) {
      console.error('Failed to send message:', error)
      // Fallback: remove the placeholder AI message
      setMessages((prev) => prev.filter((m) => m.id !== aiMsgId))
    } finally {
      setSending(false)
    }
  }

  const handleClearChat = async () => {
    if (!params?.id) return
    if (!confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/ai-trader/${params.id}/messages/clear`, {
        method: 'POST',
      })

      if (response.ok) {
        setMessages([])
        console.log('[AI Chat] Chat history cleared')
      }
    } catch (error) {
      console.error('Failed to clear chat:', error)
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

        // Update available tools
        if (data.availableTools) {
          setAvailableTools(data.availableTools)
          console.log('[AI Trigger] Available Tools:', data.availableTools)
        }

        if (data.toolCalls && data.toolCalls.length > 0) {
          console.log('[AI Trigger] Tool calls:', data.toolCalls)
        }

        // All messages (system, tool, assistant) are saved to DB and will appear via polling
        console.log('[AI Trigger] Response:', data.response)
        console.log('[AI Trigger] Usage:', data.usage)
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
    <Box
      sx={{
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        width: isFullscreen ? '100vw' : 'auto',
        height: isFullscreen ? '100vh' : 'auto',
        zIndex: isFullscreen ? 9999 : 'auto',
        backgroundColor: isFullscreen ? '#121212' : 'transparent',
        overflow: isFullscreen ? 'auto' : 'visible',
        p: isFullscreen ? 3 : 0,
      }}
    >
      <Container maxWidth={isFullscreen ? false : 'lg'} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Chat & Control Center
        </Typography>

        {!isFullscreen && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Status:</strong> {traderInfo.isRunning ? 'Running' : 'Stopped'} |{' '}
              <strong>Model:</strong> {traderInfo.llmProvider}/{traderInfo.llmModel}
              {availableTools.length > 0 && (
                <>
                  {' '}| <strong>MCP Tools:</strong> {availableTools.length} available
                </>
              )}
            </Typography>
          </Alert>

          {debugMode && availableTools.length > 0 && (
            <Paper sx={{ p: 2, mb: 2, backgroundColor: '#0a0a0a' }}>
              <Typography variant="subtitle2" color="warning.main" gutterBottom>
                Available MCP Tools:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {availableTools.map((tool) => (
                  <Chip key={tool} label={tool} size="small" variant="outlined" />
                ))}
              </Box>
            </Paper>
          )}
        </>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {!isFullscreen && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Refresh />}
              onClick={() => handleTriggerAction('poll_market')}
              disabled={sending}
            >
              Poll Market
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Psychology />}
              onClick={() => handleTriggerAction('analyze_opportunities')}
              disabled={sending}
            >
              Analyze
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
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={debugMode ? 'contained' : 'outlined'}
            size="small"
            startIcon={<Code />}
            onClick={() => setDebugMode(!debugMode)}
          >
            Debug
          </Button>
          <Button
            variant={isFullscreen ? 'contained' : 'outlined'}
            size="small"
            startIcon={isFullscreen ? <FullscreenExit /> : <Fullscreen />}
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? 'Exit' : 'Full'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<ClearAll />}
            onClick={handleClearChat}
          >
            Clear Chat
          </Button>
        </Box>
      </Box>

      <Paper 
        sx={{ 
          height: isFullscreen ? 'calc(100vh - 300px)' : 600, 
          display: 'flex', 
          flexDirection: 'column',
          flexGrow: isFullscreen ? 1 : 0,
        }}
      >
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
              {messages.map((message, index) => {
                // Group tool calls with the next assistant message
                if (message.role === 'tool') {
                  return null // Don't render tool messages independently
                }

                // Find tool calls that precede this assistant message
                const toolCalls: typeof messages = []
                if (message.role === 'assistant') {
                  let i = index - 1
                  while (i >= 0 && messages[i].role === 'tool') {
                    toolCalls.unshift(messages[i])
                    i--
                  }
                }

                return (
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
                        label={
                          message.role === 'user'
                            ? currentUserName
                            : message.role === 'assistant'
                              ? traderInfo.username
                              : 'SYSTEM'
                        }
                        size="small"
                        color={message.role === 'user' ? 'primary' : message.role === 'assistant' ? 'success' : 'default'}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </Typography>
                    </Box>

                    {/* Show compact tool calls under AI name */}
                    {message.meta?.toolCalls && Array.isArray(message.meta.toolCalls) && message.meta.toolCalls.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5, ml: 1 }}>
                        {message.meta.toolCalls.map((toolCall: any, idx: number) => {
                          const toolName = toolCall.name || 'tool'
                          const status = toolCall.status || 'running'
                          return (
                            <Chip
                              key={`${toolName}-${idx}`}
                              label={
                                status === 'running'
                                  ? `${toolName} running...`
                                  : status === 'completed'
                                    ? `✓ ${toolName}`
                                    : `✗ ${toolName}`
                              }
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                borderColor:
                                  status === 'completed'
                                    ? 'success.main'
                                    : status === 'failed'
                                      ? 'error.main'
                                      : 'warning.main',
                                color:
                                  status === 'completed'
                                    ? 'success.main'
                                    : status === 'failed'
                                      ? 'error.main'
                                      : 'warning.main',
                              }}
                              icon={
                                status === 'running' ? (
                                  <CircularProgress size={10} sx={{ color: 'warning.main' }} />
                                ) : undefined
                              }
                            />
                          )
                        })}
                      </Box>
                    )}
                    <Paper
                      sx={{
                        p: 2,
                        maxWidth: '80%',
                        backgroundColor:
                          message.role === 'user'
                            ? `${traderInfo.themeColor}20`
                            : message.role === 'system'
                              ? '#1a1a1a'
                              : '#1a1a1a',
                        border:
                          message.role === 'user'
                            ? `1px solid ${traderInfo.themeColor}40`
                            : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {message.role === 'system' ? (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          {message.content}
                        </Typography>
                      ) : (
                      <Box
                        sx={{
                          '& p': { margin: '0.5em 0' },
                          '& p:first-of-type': { marginTop: 0 },
                          '& p:last-of-type': { marginBottom: 0 },
                          '& ul, & ol': { margin: '0.5em 0', paddingLeft: '1.5em' },
                          '& li': { margin: '0.25em 0' },
                          '& code': {
                            backgroundColor: 'rgba(0,0,0,0.3)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.9em',
                          },
                          '& pre': {
                            backgroundColor: 'rgba(0,0,0,0.3)',
                            padding: '12px',
                            borderRadius: '8px',
                            overflow: 'auto',
                            margin: '0.5em 0',
                          },
                          '& pre code': {
                            backgroundColor: 'transparent',
                            padding: 0,
                          },
                          '& table': {
                            borderCollapse: 'collapse',
                            margin: '0.5em 0',
                            width: '100%',
                          },
                          '& th, & td': {
                            border: '1px solid rgba(255,255,255,0.2)',
                            padding: '8px',
                            textAlign: 'left',
                          },
                          '& th': {
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            fontWeight: 'bold',
                          },
                          '& blockquote': {
                            borderLeft: '4px solid rgba(255,255,255,0.3)',
                            paddingLeft: '12px',
                            margin: '0.5em 0',
                            color: 'rgba(255,255,255,0.7)',
                          },
                          '& a': {
                            color: traderInfo?.themeColor || '#00ff88',
                            textDecoration: 'underline',
                          },
                          '& hr': {
                            border: 'none',
                            borderTop: '1px solid rgba(255,255,255,0.2)',
                            margin: '1em 0',
                          },
                        }}
                      >
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw]}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </Box>
                      )}
                    </Paper>
                    {debugMode && message.meta?.executedTools && Array.isArray(message.meta.executedTools) && (
                      <Accordion
                        sx={{
                          mt: 1,
                          maxWidth: '80%',
                          backgroundColor: '#0a0a0a',
                          '&:before': { display: 'none' },
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMore sx={{ color: 'warning.main' }} />}
                          sx={{
                            minHeight: 32,
                            '& .MuiAccordionSummary-content': { margin: '8px 0' },
                          }}
                        >
                          <Typography variant="caption" color="warning.main">
                            Debug: Tool Results ({message.meta.executedTools.length})
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ pt: 0 }}>
                          {message.meta.executedTools.map((tool: any, idx: number) => (
                            <Box key={idx} sx={{ mb: idx < (message.meta?.executedTools?.length || 0) - 1 ? 2 : 0 }}>
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold', color: 'success.main' }}>
                                {tool.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                component="pre"
                                sx={{ fontSize: 9, overflow: 'auto', maxHeight: 200 }}
                              >
                                {JSON.stringify(tool.result, null, 2)}
                              </Typography>
                            </Box>
                          ))}
                        </AccordionDetails>
                      </Accordion>
                    )}
                  </Box>
                )
              })}
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
    </Box>
  )
}

