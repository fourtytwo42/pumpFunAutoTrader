'use client'

import { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Slider,
  IconButton,
  Chip,
  Alert,
} from '@mui/material'
import { Replay, Speed } from '@mui/icons-material'

interface SimulationState {
  currentTimestamp: bigint
  startTimestamp: bigint
  playbackSpeed: number
  isActive: boolean
}

export default function TimeTravelControls() {
  const [state, setState] = useState<SimulationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeInput, setTimeInput] = useState('')
  const [speedInput, setSpeedInput] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchState = async () => {
    try {
      const response = await fetch('/api/simulation/time', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        if (data) {
          setState({
            currentTimestamp: BigInt(data.currentTimestamp ?? 0),
            startTimestamp: BigInt(data.startTimestamp ?? 0),
            playbackSpeed: Number(data.playbackSpeed ?? 1),
            isActive: Boolean(data.isActive),
          })
          setSpeedInput(Number(data.playbackSpeed ?? 1))
          setError(null)
        } else {
          setState(null)
        }
      } else {
        const errorText = await response.text().catch(() => '')
        console.error('Failed to fetch simulation state', {
          status: response.status,
          body: errorText,
        })
        setError('Failed to fetch simulation state')
      }
    } catch (fetchErr) {
      console.error('Error fetching simulation state:', fetchErr)
      setError('Failed to fetch simulation state')
    } finally {
      setLoading(false)
    }
  }

  const handleSetTime = async () => {
    if (!timeInput) {
      setError('Please choose a date and time to jump to')
      return
    }

    const parsedTimestamp = new Date(timeInput).getTime()
    if (!Number.isFinite(parsedTimestamp)) {
      setError('Please choose a valid date and time')
      return
    }

    try {
      const response = await fetch('/api/simulation/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timestamp: Math.max(parsedTimestamp, 0).toString() }),
      })

      if (response.ok) {
        setError(null)
        fetchState()
        window.location.reload()
      } else {
        const data = await response.json().catch(() => null)
        setError(data?.error || 'Failed to update simulation time')
      }
    } catch (setErr) {
      console.error('Error setting time:', setErr)
      setError('Failed to update simulation time')
    }
  }

  const handleSetSpeed = async (speed: number) => {
    try {
      const response = await fetch('/api/simulation/playback-speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ speed }),
      })

      if (response.ok) {
        setSpeedInput(speed)
        setError(null)
        fetchState()
      } else {
        const data = await response.json().catch(() => null)
        setError(data?.error || 'Failed to update playback speed')
      }
    } catch (setErr) {
      console.error('Error setting speed:', setErr)
      setError('Failed to update playback speed')
    }
  }

  const handleReset = async () => {
    if (!state) {
      return
    }

    try {
      const response = await fetch('/api/simulation/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timestamp: state.startTimestamp.toString() }),
      })

      if (response.ok) {
        setError(null)
        fetchState()
        window.location.reload()
      } else {
        const data = await response.json().catch(() => null)
        setError(data?.error || 'Failed to reset simulation time')
      }
    } catch (resetErr) {
      console.error('Error resetting simulation time:', resetErr)
      setError('Failed to reset simulation time')
    }
  }

  if (loading || !state) {
    return null
  }

  const currentDate = new Date(Number(state.currentTimestamp))
  const startDate = new Date(Number(state.startTimestamp))

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        Time Travel Controls
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Current Time: {currentDate.toLocaleString()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Start Time: {startDate.toLocaleString()}
          </Typography>
        </Box>

        {error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            label="Jump to Date/Time"
            type="datetime-local"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <Button variant="contained" onClick={handleSetTime}>
            Jump
          </Button>
          <IconButton onClick={handleReset} title="Reset">
            <Replay />
          </IconButton>
        </Box>

        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Speed sx={{ fontSize: 20 }} />
            <Typography variant="body2">Playback Speed: {speedInput}x</Typography>
          </Box>
          <Slider
            value={speedInput}
            min={0.1}
            max={10}
            step={0.1}
            onChange={(_, value) => setSpeedInput(value as number)}
            onChangeCommitted={(_, value) => handleSetSpeed(value as number)}
          />
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
            {[0.5, 1, 2, 5, 10].map((speed) => (
              <Chip
                key={speed}
                label={`${speed}x`}
                size="small"
                onClick={() => handleSetSpeed(speed)}
                color={speedInput === speed ? 'primary' : 'default'}
                variant={speedInput === speed ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary">
          Note: Changing the time will reset your portfolio and balance
        </Typography>
      </Box>
    </Paper>
  )
}
