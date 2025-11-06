'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { Box, CircularProgress, Typography } from '@mui/material'

interface CandleData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface PriceChartProps {
  tokenAddress: string
  interval?: '1m' | '5m' | '1h' | '6h' | '24h'
  height?: number
}

export default function PriceChart({ tokenAddress, interval = '1m', height = 300 }: PriceChartProps) {
  const [data, setData] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchChartData()
  }, [tokenAddress, interval])

  const fetchChartData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Get current simulation time for time-travel support
      let simulationTime: string | null = null
      try {
        const simResponse = await fetch('/api/simulation/time')
        if (simResponse.ok) {
          const simData = await simResponse.json()
          if (simData?.currentTimestamp) {
            simulationTime = simData.currentTimestamp.toString()
          }
        }
      } catch (e) {
        // If simulation time fetch fails, continue without it (real-time mode)
      }

      // Build URL with simulation time if available
      let url = `/api/tokens/${tokenAddress}/candles?interval=${interval}&limit=500`
      if (simulationTime) {
        url += `&simulation_time=${simulationTime}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch chart data')
      }
      const result = await response.json()
      setData(result.candles || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, flexDirection: 'column', gap: 2 }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Loading chart data...
        </Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      </Box>
    )
  }

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
        <Typography variant="body2" color="text.secondary">
          No chart data available
        </Typography>
      </Box>
    )
  }

  const chartData = data.map((candle) => ({
    time: new Date(parseInt(candle.timestamp)).toLocaleTimeString(),
    price: Number(candle.close),
    volume: Number(candle.volume),
  }))

  const minPrice = Math.min(...chartData.map((d) => d.price))
  const maxPrice = Math.max(...chartData.map((d) => d.price))
  const priceRange = maxPrice - minPrice
  const yAxisDomain = [minPrice - priceRange * 0.1, maxPrice + priceRange * 0.1]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis
          dataKey="time"
          stroke="#888"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#888' }}
        />
        <YAxis
          domain={yAxisDomain}
          stroke="#888"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#888' }}
          tickFormatter={(value) => value.toFixed(8)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
          }}
          formatter={(value: number) => [value.toFixed(8), 'Price']}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke="#00ff88"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorPrice)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

