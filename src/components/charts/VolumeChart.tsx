'use client'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Box, CircularProgress, Typography } from '@mui/material'

interface CandleData {
  timestamp: string
  volume: number
}

interface VolumeChartProps {
  tokenAddress: string
  interval?: '1m' | '5m' | '1h' | '6h' | '24h'
  height?: number
}

export default function VolumeChart({ tokenAddress, interval = '1h', height = 200 }: VolumeChartProps) {
  const [data, setData] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChartData()
  }, [tokenAddress, interval])

  const fetchChartData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/tokens/${tokenAddress}/candles?interval=${interval}&limit=100`)
      if (response.ok) {
        const result = await response.json()
        setData(result.candles || [])
      }
    } catch (err) {
      console.error('Error fetching volume data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (data.length === 0) {
    return null
  }

  const chartData = data.map((candle) => ({
    time: new Date(parseInt(candle.timestamp)).toLocaleTimeString(),
    volume: Number(candle.volume),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis
          dataKey="time"
          stroke="#888"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#888' }}
        />
        <YAxis
          stroke="#888"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#888' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
          }}
          formatter={(value: number) => [value.toFixed(2), 'Volume']}
        />
        <Bar dataKey="volume" fill="#8884d8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

