'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  Box,
} from '@mui/material'
import { formatDistanceToNow } from 'date-fns'
import { useEventStream } from '@/hooks/useEventStream'

interface AgentEvent {
  id: string
  ts: string
  kind: string
  level: string
  tokenMint: string | null
  rationale: string | null
}

interface AgentEventFeedProps {
  walletId: string
  initialEvents: AgentEvent[]
}

const REFRESH_INTERVAL_MS = 40_000

export function AgentEventFeed({ walletId, initialEvents }: AgentEventFeedProps) {
  const [events, setEvents] = useState(initialEvents)

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agent/events?walletId=${encodeURIComponent(walletId)}&limit=8`,
        { cache: 'no-store' }
      )
      if (!response.ok) return
      const data = await response.json()
      setEvents(data.events ?? [])
    } catch (error) {
      console.error('Failed to refresh agent events', error)
    }
  }, [walletId])

  useEffect(() => {
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchEvents])

  useEventStream({
    'agent:event': (payload: any) => {
      if (payload?.walletId && payload.walletId !== walletId) return
      fetchEvents()
    },
  })

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Agent Signals</Typography>
      </Box>
      {events.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No recent agent events.
        </Typography>
      ) : (
        <List dense>
          {events.map((event) => (
            <ListItem key={event.id} sx={{ alignItems: 'flex-start' }}>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip
                        label={event.kind}
                        size="small"
                        color={event.level === 'error' ? 'error' : event.level === 'warn' ? 'warning' : 'primary'}
                      />
                      {event.tokenMint ? (
                        <Typography variant="caption" color="text.secondary">
                          {event.tokenMint}
                        </Typography>
                      ) : null}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatDistanceToNow(new Date(event.ts), { addSuffix: true })}
                    </Typography>
                  </Box>
                }
                secondary={
                  event.rationale ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {event.rationale}
                    </Typography>
                  ) : null
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  )
}
