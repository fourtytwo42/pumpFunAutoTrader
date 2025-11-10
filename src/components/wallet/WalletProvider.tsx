'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import CloseIcon from '@mui/icons-material/Close'

type TransactionKind = 'buy' | 'sell'

interface WalletTransaction {
  id: string
  type: TransactionKind
  amountSol: number
  amountTokens: number
  tokenSymbol: string
  tokenName: string
  priceSol: number
  timestamp: string
}

interface TransactionRequest {
  type: TransactionKind
  tokenSymbol: string
  tokenName: string
  amountSol?: number
  amountTokens?: number
}

interface WalletSummary {
  balanceSol: number | null
  balanceUsd: number | null
  solUsdPrice: number | null
  transactions: WalletTransaction[]
}

interface WalletContextValue {
  balanceSol: number | null
  balanceDisplay: string
  loading: boolean
  solUsdPrice: number | null
  transactions: WalletTransaction[]
  openWallet: () => void
  requestApproval: (request: TransactionRequest) => Promise<boolean>
  refresh: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

function formatSol(value: number | null) {
  if (value == null) return '—'
  return `${value.toFixed(2)} SOL`
}

function formatUsd(value: number | null) {
  if (value == null) return '—'
  return `$${value.toFixed(2)}`
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch (error) {
    return value
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<WalletSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<{
    open: boolean
    request: TransactionRequest | null
  }>({ open: false, request: null })
  const confirmResolverRef = useRef<((accepted: boolean) => void) | undefined>(undefined)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/wallet/summary')
      if (!res.ok) {
        throw new Error('Failed to load wallet summary')
      }
      const data = await res.json()
      setSummary({
        balanceSol: typeof data.balanceSol === 'number' ? data.balanceSol : null,
        balanceUsd: typeof data.balanceUsd === 'number' ? data.balanceUsd : null,
        solUsdPrice: typeof data.solUsdPrice === 'number' ? data.solUsdPrice : null,
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
      })
    } catch (error) {
      console.error('Failed to load wallet summary', error)
      setSummary({ balanceSol: null, balanceUsd: null, solUsdPrice: null, transactions: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const openWallet = useCallback(() => {
    setWalletOpen(true)
  }, [])

  const requestApproval = useCallback((request: TransactionRequest) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve
      setConfirmState({ open: true, request })
    })
  }, [])

  const resolveConfirmation = useCallback(
    (accepted: boolean) => {
      confirmResolverRef.current?.(accepted)
      confirmResolverRef.current = undefined
      setConfirmState({ open: false, request: null })
      if (accepted) {
        fetchSummary()
      }
    },
    [fetchSummary]
  )

  const balanceDisplay = useMemo(() => {
    if (!summary) return 'Loading wallet...'
    const sol = formatSol(summary.balanceSol)
    const usd = summary.balanceUsd != null ? ` (${formatUsd(summary.balanceUsd)})` : ''
    return `${sol}${usd}`
  }, [summary])

  const contextValue: WalletContextValue = useMemo(
    () => ({
      balanceSol: summary?.balanceSol ?? null,
      balanceDisplay,
      loading,
      solUsdPrice: summary?.solUsdPrice ?? null,
      transactions: summary?.transactions ?? [],
      openWallet,
      requestApproval,
      refresh: fetchSummary,
    }),
    [summary, balanceDisplay, loading, openWallet, requestApproval, fetchSummary]
  )

  const confirmRequest = confirmState.request

  return (
    <WalletContext.Provider value={contextValue}>
      {children}

      <Dialog open={walletOpen} onClose={() => setWalletOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Wallet
          <Box>
            <IconButton size="small" onClick={fetchSummary} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => setWalletOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Connected account
            </Typography>
            <Typography variant="h5" fontWeight={600}>
              {formatSol(summary?.balanceSol ?? null)}
            </Typography>
            {summary?.balanceUsd != null ? (
              <Typography variant="body2" color="text.secondary">
                ≈ {formatUsd(summary.balanceUsd)}
              </Typography>
            ) : null}
            {summary?.solUsdPrice != null ? (
              <Typography variant="caption" color="text.secondary">
                1 SOL ≈ ${summary.solUsdPrice.toFixed(2)}
              </Typography>
            ) : null}
          </Stack>

          <Divider sx={{ mb: 2 }}>
            <Chip label="Recent Activity" size="small" />
          </Divider>

          {summary?.transactions?.length ? (
            <List dense sx={{ maxHeight: 280, overflow: 'auto' }}>
              {summary.transactions.map((tx) => (
                <ListItem key={tx.id} alignItems="flex-start">
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={tx.type.toUpperCase()}
                          color={tx.type === 'buy' ? 'success' : 'warning'}
                          size="small"
                        />
                        <Typography variant="body2" fontWeight={600}>
                          {tx.tokenSymbol}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatTimestamp(tx.timestamp)}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="body2">
                          {tx.amountTokens.toFixed(4)} tokens @ {tx.priceSol.toFixed(4)} SOL
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Total: {tx.amountSol.toFixed(4)} SOL
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No transactions yet.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWalletOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmState.open} onClose={() => resolveConfirmation(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Transaction</DialogTitle>
        <DialogContent dividers>
          {confirmRequest ? (
            <Stack spacing={1.5}>
              <Typography variant="body1">
                {confirmRequest.type === 'buy' ? 'Buy' : 'Sell'} {confirmRequest.tokenSymbol}
              </Typography>
              {confirmRequest.amountSol != null ? (
                <Typography variant="body2">
                  Amount: {confirmRequest.amountSol.toFixed(4)} SOL
                </Typography>
              ) : null}
              {confirmRequest.amountTokens != null ? (
                <Typography variant="body2">
                  Tokens: {confirmRequest.amountTokens.toFixed(4)}
                </Typography>
              ) : null}
              <Typography variant="body2" color="text.secondary">
                Token: {confirmRequest.tokenName}
              </Typography>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => resolveConfirmation(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => resolveConfirmation(true)}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

