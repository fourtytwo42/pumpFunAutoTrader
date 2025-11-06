'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Box, CircularProgress, Typography } from '@mui/material'

interface CandleData {
  timestamp: string
  volume: number
  open?: number
  close?: number
  buyVolume?: number | null
  sellVolume?: number | null
}

interface VolumeChartProps {
  tokenAddress: string
  interval?: '1m' | '5m' | '1h' | '6h' | '24h'
  height?: number
}

export default function VolumeChart({ tokenAddress, interval = '1m', height = 200 }: VolumeChartProps) {
  const [data, setData] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchChartData = useCallback(async () => {
    setLoading(true)
    try {
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
        // ignore simulation fetch issues
      }

      let url = `/api/tokens/${tokenAddress}/candles?interval=${interval}&limit=500`
      if (simulationTime) {
        url += `&simulation_time=${simulationTime}`
      }

      const response = await fetch(url)
      if (response.ok) {
        const result = await response.json()
        setData(result.candles || [])
      }
    } catch (err) {
      console.error('Error fetching volume data:', err)
    } finally {
      setLoading(false)
    }
  }, [interval, tokenAddress])

  useEffect(() => {
    fetchChartData()
  }, [fetchChartData])

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

  const chartData = data.map((candle) => {
    const timestampMs = Number.parseInt(candle.timestamp)
    const buyVolume = candle.buyVolume ?? undefined
    const sellVolume = candle.sellVolume ?? undefined
    const direction = (() => {
      if (buyVolume !== undefined && sellVolume !== undefined && buyVolume !== null && sellVolume !== null) {
        if (buyVolume === sellVolume) {
          return (candle.close ?? 0) >= (candle.open ?? 0) ? 'up' : 'down'
        }
        return buyVolume > sellVolume ? 'up' : 'down'
      }
      return (candle.close ?? 0) >= (candle.open ?? 0) ? 'up' : 'down'
    })()
    return {
      time: new Date(timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      volume: Number(candle.volume),
      color: direction === 'up' ? '#00ff88' : '#ff4d4d',
    }
  })

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
        <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

