'use client'

import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  CircularProgress,
  Pagination,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Paper,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TwitterIcon from '@mui/icons-material/Twitter'
import TelegramIcon from '@mui/icons-material/Telegram'
import LanguageIcon from '@mui/icons-material/Language'
import { useRouter } from 'next/navigation'
import IconButton from '@mui/material/IconButton'

interface Token {
  id: string
  mintAddress: string
  symbol: string
  name: string
  imageUri: string | null
  twitter: string | null
  telegram: string | null
  website: string | null
  price: { priceSol: number; priceUsd: number } | null
  buyVolume: number
  sellVolume: number
  totalVolume: number
  volumeRatio: number
  uniqueTraders: number
  buyVolumeSol?: number
  sellVolumeSol?: number
  totalVolumeSol?: number
}

export default function TokensPage() {
  const router = useRouter()
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sortBy, setSortBy] = useState('volume')

  useEffect(() => {
    // Initial fetch with loading indicator
    fetchTokens(true)
    
    // Poll for updates every 5 seconds for real-time data (without loading indicator)
    const interval = setInterval(() => {
      fetchTokens(false)
    }, 5000)
    
    return () => clearInterval(interval)
  }, [page, search, sortBy])

  const fetchTokens = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      })
      if (search) {
        params.append('search', search)
      }
      if (sortBy) {
        params.append('sortBy', sortBy)
      }

      const response = await fetch(`/api/tokens?${params}`)
      const data = await response.json()
      setTokens(data.tokens || [])
      setTotalPages(data.pagination?.totalPages || 1)
    } catch (error) {
      console.error('Error fetching tokens:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const getCardColor = (volumeRatio: number) => {
    if (volumeRatio > 0.6) {
      // More green for higher buy volume - pump.fun style
      const intensity = Math.min((volumeRatio - 0.6) / 0.4, 1)
      return `rgba(0, 255, 136, ${0.15 + intensity * 0.25})`
    } else if (volumeRatio < 0.4) {
      // More red for higher sell volume
      const intensity = Math.min((0.4 - volumeRatio) / 0.4, 1)
      return `rgba(255, 68, 68, ${0.15 + intensity * 0.25})`
    }
    return 'rgba(26, 26, 26, 1)'
  }

  const formatPricePerMillion = (priceUsd: number | null) => {
    if (!priceUsd || priceUsd === 0) return 'N/A'
    
    // Convert to price per million tokens
    const pricePerMillion = priceUsd * 1_000_000
    
    // Format the price
    if (pricePerMillion < 0.01) {
      return `$${pricePerMillion.toFixed(4)}`
    } else if (pricePerMillion < 1000) {
      return `$${pricePerMillion.toFixed(2)}`
    } else if (pricePerMillion < 1000000) {
      return `$${(pricePerMillion / 1000).toFixed(2)}K`
    } else {
      return `$${(pricePerMillion / 1000000).toFixed(2)}M`
    }
  }

  const formatVolume = (volume: number) => {
    if (volume === 0 || !volume) return '$0.00'
    if (volume < 0.01) return `$${volume.toFixed(4)}`
    if (volume < 1000) return `$${volume.toFixed(2)}`
    if (volume < 1000000) return `$${(volume / 1000).toFixed(2)}K`
    return `$${(volume / 1000000).toFixed(2)}M`
  }
  
  const formatVolumeSol = (volumeSol: number | undefined) => {
    if (!volumeSol || volumeSol === 0) return '0 SOL'
    if (volumeSol < 0.001) return `${volumeSol.toFixed(6)} SOL`
    if (volumeSol < 1) return `${volumeSol.toFixed(4)} SOL`
    if (volumeSol < 1000) return `${volumeSol.toFixed(2)} SOL`
    return `${(volumeSol / 1000).toFixed(2)}K SOL`
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Tokens
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Sort By</InputLabel>
          <Select value={sortBy} label="Sort By" onChange={(e) => setSortBy(e.target.value)}>
            <MenuItem value="volume">Volume</MenuItem>
            <MenuItem value="traders">Traders</MenuItem>
            <MenuItem value="price">Price</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <TextField
        fullWidth
        placeholder="Search tokens..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {loading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            p: 8,
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <CircularProgress size={48} sx={{ color: '#00ff88' }} />
          <Typography variant="body2" color="text.secondary">
            Loading tokens...
          </Typography>
        </Box>
      ) : tokens.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No tokens found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {search ? 'Try adjusting your search terms' : 'Tokens will appear here once data is loaded'}
          </Typography>
        </Paper>
      ) : (
        <>
          <Grid container spacing={2}>
            {tokens.map((token) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={token.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0, 255, 136, 0.2)',
                    },
                    backgroundColor: getCardColor(token.volumeRatio),
                    border: '2px solid',
                    borderColor: token.volumeRatio > 0.6 ? 'rgba(0, 255, 136, 0.3)' : token.volumeRatio < 0.4 ? 'rgba(255, 68, 68, 0.3)' : '#333',
                  }}
                  onClick={() => router.push(`/dashboard/tokens/${token.mintAddress}`)}
                >
                  <CardContent sx={{ p: 2 }}>
                    {/* Large token image at top */}
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                      {token.imageUri ? (
                        <Box
                          component="img"
                          src={token.imageUri}
                          alt={token.name}
                          sx={{
                            width: 100,
                            height: 100,
                            borderRadius: '12px',
                            objectFit: 'cover',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '2px solid rgba(255, 255, 255, 0.1)',
                            display: 'block',
                          }}
                          onError={(e: any) => {
                            // Hide image and show fallback
                            e.target.style.display = 'none'
                            const fallback = e.target.parentElement?.querySelector('.token-fallback')
                            if (fallback) {
                              (fallback as HTMLElement).style.display = 'flex'
                            }
                          }}
                        />
                      ) : null}
                      <Box
                        className="token-fallback"
                        sx={{
                          width: 100,
                          height: 100,
                          borderRadius: '12px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '2px solid rgba(255, 255, 255, 0.1)',
                          display: token.imageUri ? 'none' : 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '36px',
                          fontWeight: 'bold',
                          color: 'text.secondary',
                        }}
                      >
                        {token.symbol.charAt(0)}
                      </Box>
                    </Box>

                    {/* Token name and symbol */}
                    <Box sx={{ textAlign: 'center', mb: 2 }}>
                      <Typography variant="h6" noWrap sx={{ fontWeight: 'bold', mb: 0.5 }}>
                        {token.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 1 }}>
                        {token.symbol}
                      </Typography>
                      
                      {/* Social media icons */}
                      {(token.twitter || token.telegram || token.website) && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 1 }}>
                          {token.twitter && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(token.twitter!, '_blank', 'noopener,noreferrer')
                              }}
                              sx={{ 
                                color: 'text.secondary',
                                '&:hover': { color: '#1DA1F2' },
                                p: 0.5,
                              }}
                            >
                              <TwitterIcon fontSize="small" />
                            </IconButton>
                          )}
                          {token.telegram && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(token.telegram!, '_blank', 'noopener,noreferrer')
                              }}
                              sx={{ 
                                color: 'text.secondary',
                                '&:hover': { color: '#0088cc' },
                                p: 0.5,
                              }}
                            >
                              <TelegramIcon fontSize="small" />
                            </IconButton>
                          )}
                          {token.website && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(token.website!, '_blank', 'noopener,noreferrer')
                              }}
                              sx={{ 
                                color: 'text.secondary',
                                '&:hover': { color: 'primary.main' },
                                p: 0.5,
                              }}
                            >
                              <LanguageIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      )}
                    </Box>

                    {/* Price */}
                    <Box sx={{ mb: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Price (per 1M tokens)
                      </Typography>
                      <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                        {token.price && token.price.priceUsd && Number(token.price.priceUsd) > 0
                          ? formatPricePerMillion(token.price.priceUsd)
                          : 'N/A'}
                      </Typography>
                      {token.price && token.price.priceSol && Number(token.price.priceSol) > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {Number(token.price.priceSol).toFixed(8)} SOL/token
                        </Typography>
                      )}
                    </Box>

                    {/* Volume info */}
                    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Chip
                        label={`Buy: ${formatVolume(token.buyVolume)}`}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                      <Chip
                        label={`Sell: ${formatVolume(token.sellVolume)}`}
                        size="small"
                        color="error"
                        variant="outlined"
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                      {token.uniqueTraders} traders • Vol: {formatVolume(token.totalVolume)}
                      {token.totalVolumeSol !== undefined && token.totalVolumeSol > 0 && (
                        <span> ({formatVolumeSol(token.totalVolumeSol)})</span>
                      )}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}
    </Container>
  )
}

