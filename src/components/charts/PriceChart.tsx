'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Customized,
} from 'recharts'
import { Box, CircularProgress, Typography, Paper, Stack } from '@mui/material'

interface CandleData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  buyVolume?: number | null
  sellVolume?: number | null
}

interface PriceChartProps {
  tokenAddress: string
  interval?: '1m' | '5m' | '1h' | '6h' | '24h'
  height?: number
}

interface ChartDatum extends CandleData {
  timeLabel: string
  timestampMs: number
  body: number
  base: number
  direction: 'up' | 'down'
}

const CHART_MARGIN = { top: 16, bottom: 16, left: 12, right: 12 } as const
const PRICE_Y_AXIS_ID = 'price'
const CANDLE_BAR_KEY = 'price-candles-bar'

type AxisScale = (value: number) => number

interface AxisMapEntry {
  scale?: AxisScale
}

interface FormattedGraphicalItem {
  item?: {
    key?: string | number | null
    props?: {
      dataKey?: string | number
      yAxisId?: string | number
    }
  }
  props?: {
    data?: Array<{
      x?: number
      width?: number
      payload?: ChartDatum
    }>
  }
}

interface CandlesRendererProps {
  formattedGraphicalItems?: FormattedGraphicalItem[]
  yAxisMap?: Record<string, AxisMapEntry>
  upColor?: string
  downColor?: string
}

const getAxisEntry = (
  axisMap: Record<string, AxisMapEntry> | undefined,
  axisId?: string | number,
) => {
  if (!axisMap) {
    return undefined
  }
  if (axisId === undefined || axisId === null) {
    return axisMap['0'] ?? Object.values(axisMap)[0]
  }
  const key = typeof axisId === 'number' ? axisId.toString() : axisId
  return axisMap[key]
}

const CandlesRenderer = ({
  formattedGraphicalItems,
  yAxisMap,
  upColor = '#00ff88',
  downColor = '#ff4d4d',
}: CandlesRendererProps) => {
  const target = formattedGraphicalItems?.find((item) => item.item?.key === CANDLE_BAR_KEY)

  if (!target?.props?.data?.length) {
    return null
  }

  const axisId = target.item?.props?.yAxisId
  const axisEntry = getAxisEntry(yAxisMap, axisId)
  const scale = axisEntry?.scale

  if (typeof scale !== 'function') {
    return null
  }

  return (
    <g>
      {target.props.data.map((entry, index) => {
        const payload = entry.payload
        if (!payload) {
          return null
        }

        const openY = scale(payload.open)
        const closeY = scale(payload.close)
        const highY = scale(payload.high)
        const lowY = scale(payload.low)

        if (![openY, closeY, highY, lowY].every((value) => Number.isFinite(value))) {
          return null
        }

        const width = typeof entry.width === 'number' ? entry.width : 8
        const xPosition = typeof entry.x === 'number' ? entry.x : 0
        const candleWidth = Math.max(width * 0.6, 6)
        const color = payload.direction === 'up' ? upColor : downColor
        const bodyTop = Math.min(openY, closeY)
        const bodyBottom = Math.max(openY, closeY)
        const bodyHeight = Math.max(bodyBottom - bodyTop, 1.5)
        const centerX = xPosition + width / 2

        return (
          <g key={`${payload.timestamp}-${index}`}>
            <line
              x1={centerX}
              x2={centerX}
              y1={highY}
              y2={lowY}
              stroke={color}
              strokeWidth={2}
            />
            <rect
              x={xPosition + (width - candleWidth) / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              stroke={color}
              rx={1}
            />
          </g>
        )
      })}
    </g>
  )
}

const CandleTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const candle = payload[0]?.payload as ChartDatum | undefined
  if (!candle) return null

  const date = new Date(candle.timestampMs)
  const timeString = date.toLocaleString()
  const color = candle.direction === 'up' ? '#00ff88' : '#ff4d4d'

  return (
    <Paper
      sx={{
        backgroundColor: '#101010',
        border: '1px solid #333',
        p: 1.5,
      }}
      elevation={0}
    >
      <Typography variant="caption" color="text.secondary">{timeString}</Typography>
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        <Typography variant="caption" color={color}>
          Close: {candle.close.toFixed(9)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Open: {candle.open.toFixed(9)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          High: {candle.high.toFixed(9)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Low: {candle.low.toFixed(9)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Volume: {candle.volume.toFixed(2)}
        </Typography>
      </Stack>
    </Paper>
  )
}

export default function PriceChart({ tokenAddress, interval = '1m', height = 300 }: PriceChartProps) {
  const [data, setData] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchChartData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/tokens/${tokenAddress}/candles?interval=${interval}&limit=500`

      console.log('[PriceChart] Fetching candle data:', url)
      const response = await fetch(url)
      console.log('[PriceChart] Response status:', response.status, response.ok)
      if (!response.ok) {
        throw new Error('Failed to fetch chart data')
      }
      const result = await response.json()
      console.log('[PriceChart] Candles received:', result.candles?.length || 0, 'candles')
      setData(result.candles || [])
    } catch (err: any) {
      console.error('[PriceChart] Error fetching chart data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [interval, tokenAddress])

  useEffect(() => {
    fetchChartData()
  }, [fetchChartData])

  const chartData: ChartDatum[] = useMemo(() => {
    return data.map((candle) => {
      const timestampMs = Number.parseInt(candle.timestamp, 10)
      const open = Number(candle.open)
      const close = Number(candle.close)
      const high = Number(candle.high)
      const low = Number(candle.low)
      const base = Math.min(open, close)
      const body = Math.max(Math.abs(close - open), Number.EPSILON)
      return {
        ...candle,
        timestampMs,
        timeLabel: new Date(timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        base,
        body,
        direction: close >= open ? 'up' : 'down',
      }
    })
  }, [data])

  const priceExtent = useMemo(() => {
    if (chartData.length === 0) {
      return { min: 0, max: 1 }
    }
    const values = chartData.flatMap((d) => [d.open, d.close, d.high, d.low])
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0
      max = 1
    }
    if (min === max) {
      const adjustment = Math.abs(min) * 0.05 || 0.00000001
      min -= adjustment
      max += adjustment
    }
    return { min, max }
  }, [chartData])

  const domain = useMemo(() => {
    const padding = (priceExtent.max - priceExtent.min) * 0.1 || Math.abs(priceExtent.min) * 0.1 || 0.00000001
    return [priceExtent.min - padding, priceExtent.max + padding] as [number, number]
  }, [priceExtent])

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

  if (chartData.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
        <Typography variant="body2" color="text.secondary">
          No chart data available
        </Typography>
      </Box>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={CHART_MARGIN} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
        <XAxis
          dataKey="timeLabel"
          stroke="#888"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#888' }}
          interval={Math.max(Math.floor(chartData.length / 12), 0)}
        />
        <YAxis
          domain={domain}
          stroke="#888"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#888' }}
          tickFormatter={(value) => value.toFixed(8)}
          width={80}
          yAxisId={PRICE_Y_AXIS_ID}
        />
        <Tooltip content={<CandleTooltip />} />
        <Bar
          key={CANDLE_BAR_KEY}
          dataKey="close"
          yAxisId={PRICE_Y_AXIS_ID}
          fill="transparent"
          stroke="transparent"
          fillOpacity={0}
          strokeOpacity={0}
          isAnimationActive={false}
        />
        <Customized component={<CandlesRenderer />} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
