"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Container,
  Typography,
  Box,
  Paper,
  Avatar,
  Button,
  TextField,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
} from "@mui/material";
import { ShoppingCart, Sell } from "@mui/icons-material";
import PriceChart from "@/components/charts/PriceChart";
import VolumeChart from "@/components/charts/VolumeChart";
import { useWallet } from "@/components/wallet/WalletProvider";

const TIME_BUCKETS = ["5m", "1h", "6h", "24h"] as const;
const CANDLE_INTERVALS = ['1m', '5m', '1h', '6h', '24h'] as const;

interface MarketActivityBucket {
  numTxs?: number;
  volumeUSD?: number;
  numUsers?: number;
  numBuys?: number;
  numSells?: number;
  buyVolumeUSD?: number;
  sellVolumeUSD?: number;
  numBuyers?: number;
  numSellers?: number;
  priceChangePercent?: number;
}

interface RemoteTopHolder {
  address: string;
  amount?: number;
  amountTokens?: number;
  share?: number;
  solBalance?: number;
}

interface RemoteTrade {
  type: "buy" | "sell";
  amountSol?: number;
  amountUsd?: number;
  priceSol?: number;
  priceUsd?: number;
  timestamp: number;
  tx: string | null;
}

interface RemoteCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface RemoteData {
  poolAddress?: string | null;
  coin?: any;
  metadata?: any;
  trades?: RemoteTrade[];
  candles?: RemoteCandle[];
  topHolders?: RemoteTopHolder[];
  marketActivity?: Record<string, MarketActivityBucket>;
  creator?: any;
}

interface TokenData {
  id: string;
  mintAddress: string;
  symbol: string;
  name: string;
  imageUri: string | null;
  creatorAddress: string;
  createdAt: number;
  kingOfTheHillTimestamp: number | null;
  completed: boolean;
  price: {
    priceSol: number;
    priceUsd: number;
    lastTradeTimestamp: number | null;
  } | null;
  stats: {
    buyVolume: number;
    sellVolume: number;
    totalVolume: number;
    uniqueTraders: number;
    totalTrades: number;
  };
  recentTrades: Array<{
    type: "buy" | "sell";
    amountSol: number;
    amountUsd: number;
    timestamp: string;
  }>;
  totalSupplyTokens?: number;
  marketCapUsd?: number;
  marketCapSol?: number;
  remote?: RemoteData;
}

interface TokenMetrics {
  priceUsd: number | null;
  priceSol: number | null;
  drawdownPct: number | null;
  holders?: {
    total: number;
    topJson: any;
  } | null;
  activity?: Record<string, any>;
}

interface UserTradeEntry {
  id: string;
  type: 'buy' | 'sell';
  amountSol: number;
  amountUsd: number;
  amountTokens: number;
  amountMillions?: number;
  priceSol: number;
  pricePerMillionSol?: number;
  priceUsd: number;
  timestamp: number;
}

interface UserPositionSummary {
  amountTokens: number;
  avgPriceSol: number;
  avgPriceUsd: number;
  currentValueSol: number;
  currentValueUsd: number;
  costBasisSol: number;
  costBasisUsd: number;
  unrealizedSol: number;
  unrealizedUsd: number;
  pnlPct: number;
}

interface UserTokenSummary {
  walletId: string;
  solBalance: number;
  position: UserPositionSummary | null;
  trades: UserTradeEntry[];
  openOrders: Array<{
    id: string;
    side: string;
    status: string;
    qtyTokens: number | null;
    qtySol: number | null;
    limitPriceSol: number | null;
    createdAt: string;
  }>;
  currentPriceSol: number;
  currentPriceUsd: number;
  solPriceUsd: number;
}

const formatCompactNumber = (value?: number, options: Intl.NumberFormatOptions = {}) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
};

const formatUsd = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  if (value <= 0) return "$0.00";
  if (value < 0.000001) return `$${value.toExponential(2)}`;
  if (value < 0.001) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  if (value < 1_000) return `$${value.toFixed(2)}`;
  if (value < 1_000_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 1_000_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${(value / 1_000_000_000).toFixed(2)}B`;
};

const formatSolValue = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  if (value <= 0) return "0 SOL";
  if (value < 0.0000001) return `${value.toExponential(2)} SOL`;
  if (value < 0.001) return `${value.toFixed(8)} SOL`;
  if (value < 1) return `${value.toFixed(6)} SOL`;
  if (value < 1_000) return `${value.toFixed(2)} SOL`;
  return `${(value / 1_000).toFixed(2)}K SOL`;
};

const formatUsdFull = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
  return formatter.format(value);
};

const formatSolFull = (value?: number, fractionDigits = 4) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(fractionDigits)} SOL`;
};

const formatSolPrice = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  if (value === 0) return "0 SOL";
  const absValue = Math.abs(value);
  if (absValue < 1e-8) {
    return `${value.toExponential(2)} SOL`;
  }
  if (absValue < 1e-4) {
    return `${value.toFixed(8)} SOL`;
  }
  return `${value.toFixed(6)} SOL`;
};

const formatCurrencyWithSign = (value?: number, currency: 'USD' | 'SOL' = 'USD') => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    signDisplay: 'always',
  });
  if (currency === 'USD') {
    return formatter.format(value);
  }
  return `${value >= 0 ? '+' : '-'}${formatSolValue(Math.abs(value))}`;
};

const formatPercentWithSign = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

const formatPercent = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  if (!Number.isFinite(value)) return "N/A";
  return `${value.toFixed(2)}%`;
};

const shortenAddress = (address?: string | null) => {
  if (!address) return "N/A";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

const formatTimeAgo = (timestamp?: number | null) => {
  if (!timestamp) return "N/A";
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatTimestamp = (timestamp?: number | null) => {
  if (!timestamp) return "N/A";
  try {
    return new Date(Number(timestamp)).toLocaleString();
  } catch {
    return "N/A";
  }
};

export default function TokenDetailPage() {
  const params = useParams<{ mintAddress?: string }>();
  const router = useRouter();
  const mintAddress = params?.mintAddress;
  const { requestApproval, refresh: refreshWallet } = useWallet();

  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [trading, setTrading] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState("");
  const [candleInterval, setCandleInterval] = useState<(typeof CANDLE_INTERVALS)[number]>('1m');
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [userSummary, setUserSummary] = useState<UserTokenSummary | null>(null);
  const [userSummaryLoading, setUserSummaryLoading] = useState(true);
  const handleCandleIntervalChange = (_: unknown, value: (typeof CANDLE_INTERVALS)[number] | null) => {
    if (value) {
      setCandleInterval(value);
    }
  };


  const fetchToken = useCallback(async () => {
    if (!mintAddress) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/tokens/${mintAddress}`);
      if (!response.ok) {
        throw new Error("Token not found");
      }
      const data = await response.json();
      setToken(data);
      try {
        const metricsRes = await fetch(`/api/tokens/${mintAddress}/metrics`);
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics(metricsData);
        } else {
          setMetrics(null);
        }
      } catch (metricsError) {
        console.error('Failed to load token metrics', metricsError);
        setMetrics(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load token");
    } finally {
      setLoading(false);
    }
  }, [mintAddress]);

  const fetchUserSummary = useCallback(async () => {
    if (!mintAddress) {
      return;
    }
    setUserSummaryLoading(true);
    try {
      const res = await fetch(`/api/tokens/${mintAddress}/user`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUserSummary(data);
      } else {
        setUserSummary(null);
      }
    } catch (err) {
      console.error('Failed to load user summary', err);
      setUserSummary(null);
    } finally {
      setUserSummaryLoading(false);
    }
  }, [mintAddress]);

  useEffect(() => {
    if (!mintAddress) {
      return;
    }
    fetchToken();
    fetchUserSummary();
  }, [fetchToken, fetchUserSummary, mintAddress]);

  const handleBuy = async () => {
    if (!buyAmount || parseFloat(buyAmount) <= 0 || !token) return;
    const amountSol = parseFloat(buyAmount);
    const approved = await requestApproval({
      type: "buy",
      tokenName: token.name,
      tokenSymbol: token.symbol,
      amountSol,
    });
    if (!approved) return;
    setTrading(true);
    setTradeSuccess("");
    setError("");

    try {
      const response = await fetch("/api/trading/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token.id,
          amountSol,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Buy failed");
      }
      setTradeSuccess(
        data.tokensReceived && data.fillPrice
          ? `Bought ${data.tokensReceived?.toFixed(2)} tokens at ${data.fillPrice?.toFixed(6)} SOL!`
          : 'Buy order executed.'
      );
      refreshWallet();
      fetchUserSummary();
      setBuyAmount("");
      fetchToken();
    } catch (err: any) {
      setError(err.message || "Buy failed");
    } finally {
      setTrading(false);
    }
  };

  const handleSell = async () => {
    if (!sellAmount || parseFloat(sellAmount) <= 0 || !token) return;
    const amountTokens = parseFloat(sellAmount);
    const approved = await requestApproval({
      type: "sell",
      tokenName: token.name,
      tokenSymbol: token.symbol,
      amountTokens,
    });
    if (!approved) return;
    setTrading(true);
    setTradeSuccess("");
    setError("");

    try {
      const response = await fetch("/api/trading/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token.id,
          amountTokens,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Sell failed");
      }
      setTradeSuccess(
        data.solReceived && data.fillPrice
          ? `Sold for ${data.solReceived?.toFixed(4)} SOL at ${data.fillPrice?.toFixed(6)} SOL!`
          : 'Sell order executed.'
      );
      refreshWallet();
      fetchUserSummary();
      setSellAmount("");
      fetchToken();
    } catch (err: any) {
      setError(err.message || "Sell failed");
    } finally {
      setTrading(false);
    }
  };

  const remote = token?.remote || null;
  const metadata = remote?.metadata || null;
  const topHolders = remote?.topHolders || [];
  const remoteTrades = remote?.trades || [];
  const marketActivity = remote?.marketActivity;

  if (!mintAddress) {
    return null;
  }

  if (loading || !token) {
    return (
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            p: 8,
            flexDirection: "column",
            gap: 2,
          }}
        >
          <CircularProgress size={48} sx={{ color: "#00ff88" }} />
          <Typography variant="body2" color="text.secondary">
            Loading token data...
          </Typography>
        </Box>
      </Container>
    );
  }

  const totalSupplyTokens =
    token.totalSupplyTokens ??
    (remote?.coin?.total_supply ? Number(remote.coin.total_supply) / 1_000_000 : undefined);
  const priceSol = token.price?.priceSol ?? 0;
  const priceUsd = token.price?.priceUsd ?? 0;
  const priceUsdDisplay = metrics?.priceUsd ?? priceUsd;
  const solReferencePrice =
    userSummary?.solPriceUsd ?? (priceSol > 0 && priceUsdDisplay > 0 ? priceUsdDisplay / priceSol : 0);
  const pricePerTokenUsd =
    priceSol > 0 && solReferencePrice > 0 ? priceSol * solReferencePrice : priceUsdDisplay;
  const pricePerMillionSol = priceSol > 0 ? priceSol * 1_000_000 : 0;
  const pricePerMillionUsd = pricePerTokenUsd > 0 ? pricePerTokenUsd * 1_000_000 : 0;
  const marketCapUsd =
    token.marketCapUsd ??
    (totalSupplyTokens && pricePerTokenUsd > 0 ? totalSupplyTokens * pricePerTokenUsd : undefined);
  const marketCapSol =
    token.marketCapSol ??
    (marketCapUsd && solReferencePrice > 0 ? marketCapUsd / solReferencePrice : undefined);

  const sortedTopHolders = [...topHolders].sort((a, b) => (b.amountTokens ?? b.amount ?? 0) - (a.amountTokens ?? a.amount ?? 0));
  const sortedRemoteTrades = [...remoteTrades].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  const pumpCoinUrl = `https://pump.fun/coin/${token.mintAddress}`;
  const poolAddress = remote?.poolAddress || null;

  const solBalanceAvailable = userSummary?.solBalance ?? 0;
  const userPosition = userSummary?.position ?? null;
  const userTrades = userSummary?.trades ?? [];
  const userSolPriceUsd = solReferencePrice;
  const tokensHeld = userPosition?.amountTokens ?? 0;
  const tokenValueSol = userPosition?.currentValueSol ?? 0;
  const tokenValueUsd = userPosition?.currentValueUsd ?? 0;
  const unrealizedUsd = userPosition?.unrealizedUsd ?? 0;
  const unrealizedSol = userPosition?.unrealizedSol ?? 0;
  const pnlPct = userPosition?.pnlPct ?? 0;
  const avgPriceSol = userPosition?.avgPriceSol ?? 0;
  const avgPricePerMillionSol = avgPriceSol > 0 ? avgPriceSol * 1_000_000 : 0;
  const avgPricePerMillionUsd =
    avgPricePerMillionSol > 0 && solReferencePrice > 0
      ? avgPricePerMillionSol * solReferencePrice
      : 0;

  const BONDING_CURVE_BASE_SOL = 30;
  const BONDING_CURVE_TARGET_SOL = 690;
  const bondingCurveVirtualSol = remote?.coin?.virtual_sol_reserves
    ? Number(remote.coin.virtual_sol_reserves) / 1_000_000_000
    : 0;
  const bondingCurveRealSol = remote?.coin?.real_sol_reserves
    ? Number(remote.coin.real_sol_reserves) / 1_000_000_000
    : 0;
  const bondingCurveActualSol =
    bondingCurveRealSol > 0
      ? bondingCurveRealSol
      : Math.max(bondingCurveVirtualSol - BONDING_CURVE_BASE_SOL, 0);
  const bondingCurveProgress = Math.min(
    BONDING_CURVE_TARGET_SOL > BONDING_CURVE_BASE_SOL
      ? (bondingCurveActualSol / (BONDING_CURVE_TARGET_SOL - BONDING_CURVE_BASE_SOL)) * 100
      : 0,
    100,
  );
  const graduateTargetUsd = 69_000;
  const bondingCurveRemainingSol = Math.max(
    BONDING_CURVE_TARGET_SOL - BONDING_CURVE_BASE_SOL - bondingCurveActualSol,
    0,
  );
  const bondingCurveRemainingUsd = Math.max(
    graduateTargetUsd - (marketCapUsd ?? 0),
    0,
  );
  const bondingCurveCompleted = token.completed;
  const bondingCurveCompletedAt = token.kingOfTheHillTimestamp
    ? new Date(token.kingOfTheHillTimestamp).toLocaleString()
    : remote?.coin?.updated_at
      ? new Date(Number(remote.coin.updated_at)).toLocaleString()
      : null;

  const BUY_PRESETS = [0.1, 0.5, 1];
  const SELL_PRESETS = [25, 50, 75, 100];
  const normalizedPnl = Number.isFinite(pnlPct) ? Math.max(Math.min(pnlPct, 200), -200) : 0;
  const pnlBarValue = Math.max(Math.min(((normalizedPnl + 200) / 4), 100), 0);

  const handleBuyPreset = (value: number) => {
    if (!solBalanceAvailable) {
      setBuyAmount('');
      return;
    }
    const amount = Math.min(value, solBalanceAvailable);
    setBuyAmount(amount > 0 ? amount.toFixed(3) : '');
  };

  const handleSellPercent = (percent: number) => {
    if (!tokensHeld) {
      setSellAmount('');
      return;
    }
    const amount = (tokensHeld * percent) / 100;
    setSellAmount(amount > 0 ? amount.toFixed(4) : '');
  };

  return (
    <Container maxWidth="lg">
      <Button onClick={() => router.back()} sx={{ mb: 2 }}>
        ← Back
      </Button>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4 }}>
        <Avatar src={token.imageUri || undefined} sx={{ width: 64, height: 64 }}>
          {token.symbol.charAt(0)}
        </Avatar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {token.name}
            {token.completed && <Chip label="Graduated" color="primary" size="small" />}
          </Typography>
          <Typography variant="h6" color="text.secondary">
            {token.symbol} • {token.mintAddress}
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button
            variant="outlined"
            color="secondary"
            size="small"
            component="a"
            href={pumpCoinUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Pump.fun
          </Button>
          {poolAddress ? (
            <Button
              variant="outlined"
              color="secondary"
              size="small"
              component="a"
              href={`https://solscan.io/account/${poolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pool on Solscan
            </Button>
          ) : null}
        </Stack>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 3, flexWrap: "wrap" }}>
        <Chip label={`Age: ${formatTimeAgo(token.createdAt)}`} variant="outlined" />
        <Chip
          label={`Last trade: ${token.price?.lastTradeTimestamp ? formatTimeAgo(token.price.lastTradeTimestamp) : "No trades"}`}
          variant="outlined"
        />
        <Chip
          label={
            token.completed
              ? "Graduated"
              : token.kingOfTheHillTimestamp
                ? `KOTH reached ${formatTimeAgo(token.kingOfTheHillTimestamp)}`
                : "KOTH not reached"
          }
          variant="outlined"
        />
        <Chip label={`Trades: ${token.stats.totalTrades}`} variant="outlined" />
        {totalSupplyTokens ? (
          <Chip label={`Supply: ${formatCompactNumber(totalSupplyTokens)}`} variant="outlined" />
        ) : null}
        {poolAddress ? (
          <Chip label={`Pool: ${shortenAddress(poolAddress)}`} variant="outlined" />
        ) : null}
        {metrics?.drawdownPct != null ? (
          <Chip
            label={`Drawdown: ${metrics.drawdownPct.toFixed(2)}%`}
            variant="outlined"
            color={metrics.drawdownPct <= 0 ? 'success' : 'warning'}
          />
        ) : null}
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("") }>
          {error}
        </Alert>
      )}

      {tradeSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setTradeSuccess("") }>
          {tradeSuccess}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'flex-start', sm: 'center' },
                justifyContent: 'space-between',
                gap: 1,
                mb: 2,
              }}
            >
              <Typography variant="h6" gutterBottom sx={{ mb: { xs: 1, sm: 0 } }}>
                Market Snapshot
              </Typography>
              <ToggleButtonGroup
                value={candleInterval}
                exclusive
                size="small"
                onChange={handleCandleIntervalChange}
                color="primary"
                aria-label="candle interval"
              >
                {CANDLE_INTERVALS.map((option) => (
                  <ToggleButton key={option} value={option} aria-label={`${option} interval`}>
                    {option}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price (per 1M tokens)
                </Typography>
                <Typography variant="h5">
                  {pricePerMillionUsd > 0 ? formatUsdFull(pricePerMillionUsd) : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price (per 1M tokens - SOL)
                </Typography>
                <Typography variant="h5">
                  {pricePerMillionSol > 0 ? formatSolValue(pricePerMillionSol) : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Market Cap (USD)
                </Typography>
                <Typography variant="h5">
                  {marketCapUsd !== undefined ? formatUsdFull(marketCapUsd) : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Market Cap (SOL)
                </Typography>
                <Typography variant="h5">
                  {marketCapSol !== undefined ? formatSolValue(marketCapSol) : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  King of the Hill
                </Typography>
                <Typography variant="h6">
                  {token.completed
                    ? "Graduated"
                    : token.kingOfTheHillTimestamp
                      ? `Reached ${formatTimeAgo(token.kingOfTheHillTimestamp)}`
                      : "Not reached"}
                </Typography>
              </Grid>
            </Grid>
            <Box sx={{ mb: 2 }}>
              <PriceChart tokenAddress={token.mintAddress} interval={candleInterval} height={300} />
            </Box>
            <Box>
              <VolumeChart tokenAddress={token.mintAddress} interval={candleInterval} height={150} />
            </Box>
          </Paper>

          {marketActivity && TIME_BUCKETS.some((bucket) => marketActivity[bucket]) && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Market Activity
              </Typography>
              <Grid container spacing={2}>
                {TIME_BUCKETS.filter((bucket) => marketActivity[bucket]).map((bucket) => {
                  const bucketData = marketActivity[bucket];
                  if (!bucketData) return null;
                  return (
                    <Grid item xs={12} sm={6} md={3} key={bucket}>
                      <Box
                        sx={{
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 2,
                          p: 2,
                          height: "100%",
                        }}
                      >
                        <Typography variant="subtitle2" gutterBottom>
                          {bucket}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Volume
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {formatUsd(bucketData.volumeUSD)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Trades
                        </Typography>
                        <Typography variant="body1">
                          {bucketData.numTxs ?? "N/A"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Price Change
                        </Typography>
                        <Typography
                          variant="body1"
                          color={
                            bucketData.priceChangePercent && bucketData.priceChangePercent < 0
                              ? "error"
                              : "success"
                          }
                        >
                          {formatPercent(bucketData.priceChangePercent)}
                        </Typography>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>
          )}

          {sortedTopHolders.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Top Holders
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Address</TableCell>
                      <TableCell align="right">Holdings</TableCell>
                      <TableCell align="right">Share</TableCell>
                      <TableCell align="right">SOL Balance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedTopHolders.map((holder, index) => {
                      const amountTokens = holder.amountTokens ?? (holder.amount ?? 0);
                      const sharePercent = holder.share ?? (totalSupplyTokens ? (amountTokens / totalSupplyTokens) * 100 : undefined);
                      return (
                        <TableRow key={`${holder.address}-${index}`} hover>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              component="a"
                              href={`https://solscan.io/account/${holder.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ textTransform: "none" }}
                            >
                              {shortenAddress(holder.address)}
                            </Button>
                          </TableCell>
                          <TableCell align="right">{formatCompactNumber(amountTokens)}</TableCell>
                          <TableCell align="right">{formatPercent(sharePercent)}</TableCell>
                          <TableCell align="right">{formatSolValue(holder.solBalance)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {sortedRemoteTrades.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                On-chain Trades (latest)
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell align="right">Amount (SOL)</TableCell>
                      <TableCell align="right">Amount (USD)</TableCell>
                      <TableCell align="right">Price (SOL)</TableCell>
                      <TableCell align="right">Price (USD)</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell>Tx</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedRemoteTrades.slice(0, 40).map((trade, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>
                          <Chip
                            label={trade.type.toUpperCase()}
                            color={trade.type === "buy" ? "success" : "error"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          {trade.amountSol !== undefined ? trade.amountSol.toFixed(4) : "-"}
                        </TableCell>
                        <TableCell align="right">
                          {trade.amountUsd !== undefined ? formatUsd(trade.amountUsd) : "-"}
                        </TableCell>
                        <TableCell align="right">
                          {trade.priceSol !== undefined ? formatSolValue(trade.priceSol) : "-"}
                        </TableCell>
                        <TableCell align="right">
                          {trade.priceUsd !== undefined ? formatUsd(trade.priceUsd) : "-"}
                        </TableCell>
                        <TableCell>
                          {trade.timestamp ? new Date(trade.timestamp).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          {trade.tx ? (
                            <Button
                              size="small"
                              component="a"
                              href={`https://solscan.io/tx/${trade.tx}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                            </Button>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {(metadata?.description || metadata?.summary || metadata?.details || metadata?.about || metadata?.story || metadata?.biography || metadata?.background || remote?.coin?.description) && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                About {token.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                {metadata?.description || metadata?.summary || metadata?.details || metadata?.about || metadata?.story || metadata?.biography || metadata?.background || remote?.coin?.description || "No description available."}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
                {["website", "twitter", "telegram"].map((key) => {
                  const value = metadata?.[key] || remote?.coin?.[key];
                  if (!value) return null;
                  let url = value as string;
                  if (key === "twitter") {
                    const handle = url.replace(/^@/, "");
                    url = `https://twitter.com/${handle}`;
                  } else if (key === "telegram") {
                    const handle = url.replace(/^@/, "");
                    url = `https://t.me/${handle}`;
                  } else if (!/^https?:/i.test(url)) {
                    url = `https://${url}`;
                  }
                  return (
                    <Button
                      key={key}
                      variant="outlined"
                      size="small"
                      component="a"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </Button>
                  );
                })}
              </Stack>
            </Paper>
          )}
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              spacing={1}
              sx={{ mb: 2 }}
            >
              <Typography variant="h6">Trade</Typography>
              <ToggleButtonGroup
                color="primary"
                value={activeTab}
                exclusive
                size="small"
                onChange={(_, value) => {
                  if (value) {
                    setActiveTab(value);
                  }
                }}
              >
                <ToggleButton value="buy">Buy</ToggleButton>
                <ToggleButton value="sell">Sell</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Available SOL
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {formatSolFull(solBalanceAvailable, 4)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Holdings
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {tokensHeld > 0 ? `${tokensHeld.toFixed(4)} ${token.symbol}` : `0 ${token.symbol}`}
                </Typography>
              </Box>
              {activeTab === 'buy' ? (
                <>
                  <TextField
                    fullWidth
                    label="Amount (SOL)"
                    type="number"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                  />
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" onClick={() => setBuyAmount('')}>
                      Reset
                    </Button>
                    {BUY_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        size="small"
                        variant="outlined"
                        onClick={() => handleBuyPreset(preset)}
                      >
                        {preset} SOL
                      </Button>
                    ))}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        setBuyAmount(solBalanceAvailable > 0 ? solBalanceAvailable.toFixed(4) : '')
                      }
                    >
                      Max
                    </Button>
                  </Box>
                </>
              ) : (
                <>
                  <TextField
                    fullWidth
                    label="Amount (Tokens)"
                    type="number"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                  />
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" onClick={() => setSellAmount('')}>
                      Reset
                    </Button>
                    {SELL_PRESETS.map((pct) => (
                      <Button
                        key={pct}
                        size="small"
                        variant="outlined"
                        onClick={() => handleSellPercent(pct)}
                      >
                        {pct}%
                      </Button>
                    ))}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSellAmount(tokensHeld > 0 ? tokensHeld.toFixed(4) : '')}
                    >
                      100%
                    </Button>
                  </Box>
                </>
              )}
              <Button
                fullWidth
                variant="contained"
                color={activeTab === 'buy' ? 'success' : 'error'}
                startIcon={activeTab === 'buy' ? <ShoppingCart /> : <Sell />}
                onClick={activeTab === 'buy' ? handleBuy : handleSell}
                disabled={
                  trading ||
                  (activeTab === 'buy'
                    ? !buyAmount ||
                      parseFloat(buyAmount) <= 0 ||
                      parseFloat(buyAmount) > solBalanceAvailable
                    : !sellAmount ||
                      parseFloat(sellAmount) <= 0 ||
                      parseFloat(sellAmount) > tokensHeld)
                }
              >
                {trading ? 'Processing...' : activeTab === 'buy' ? 'Buy' : 'Sell'}
              </Button>
            </Stack>
          </Paper>

          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Your Position
            </Typography>
            {userSummaryLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Loading wallet...
                </Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Current Value
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {tokenValueSol > 0 ? `${tokenValueSol.toFixed(4)} SOL` : '0 SOL'} (
                    {tokenValueUsd > 0 ? formatUsdFull(tokenValueUsd) : '$0.00'})
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Average Cost
                  </Typography>
                  {avgPricePerMillionSol > 0 ? (
                    <>
                      <Typography variant="body1" fontWeight={600}>
                        {formatSolFull(avgPricePerMillionSol, 6)} per 1M
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatUsdFull(avgPricePerMillionUsd)} per 1M • {formatSolPrice(avgPriceSol)} per token
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body1">N/A</Typography>
                  )}
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Unrealized P/L
                  </Typography>
                  <Typography
                    variant="body1"
                    color={unrealizedUsd >= 0 ? 'success.main' : 'error.main'}
                    fontWeight={600}
                  >
                    {formatCurrencyWithSign(unrealizedUsd)} ({formatPercentWithSign(pnlPct)})
                  </Typography>
                  <Typography
                    variant="caption"
                    color={unrealizedSol >= 0 ? 'success.main' : 'error.main'}
                    sx={{ display: 'block' }}
                  >
                    {formatSolFull(unrealizedSol, 4)}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={pnlBarValue}
                    sx={{ height: 8, borderRadius: 4, mt: 1 }}
                    color={unrealizedUsd >= 0 ? 'success' : 'error'}
                  />
                </Box>
                <Divider sx={{ my: 2 }}>Your Trades</Divider>
                {userTrades.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No trades yet.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Type</TableCell>
                          <TableCell align="right">Amount (M tokens)</TableCell>
                          <TableCell align="right">Amount (SOL)</TableCell>
                          <TableCell align="right">Amount (USD)</TableCell>
                          <TableCell align="right">Price (SOL)</TableCell>
                          <TableCell>Time</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {userTrades.slice(0, 10).map((trade) => (
                          <TableRow key={trade.id}>
                            <TableCell>
                              <Chip
                                label={trade.type.toUpperCase()}
                                color={trade.type === 'buy' ? 'success' : 'error'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell align="right">
                              {trade.amountMillions !== undefined
                                ? trade.amountMillions.toFixed(4)
                                : (trade.amountTokens / 1_000_000).toFixed(4)}
                            </TableCell>
                            <TableCell align="right">{trade.amountSol.toFixed(4)}</TableCell>
                            <TableCell align="right">{formatUsdFull(trade.amountUsd)}</TableCell>
                            <TableCell align="right">
                              {trade.pricePerMillionSol
                                ? `${formatSolValue(trade.pricePerMillionSol)} / 1M`
                                : `${formatSolPrice(trade.priceSol)} / token`}
                            </TableCell>
                            <TableCell>{formatTimestamp(trade.timestamp)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                {userSummary?.openOrders?.length ? (
                  <>
                    <Divider sx={{ my: 2 }}>Open Orders</Divider>
                    <Stack spacing={1}>
                      {userSummary.openOrders.map((order) => (
                        <Box
                          key={order.id}
                          sx={{
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            p: 1.5,
                          }}
                        >
                          <Typography variant="body2" fontWeight={600}>
                            {order.side.toUpperCase()} • {order.status}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Created {formatTimestamp(Date.parse(order.createdAt))}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </>
                ) : null}
              </>
            )}
          </Paper>

          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Bonding Curve Progress
            </Typography>
            {bondingCurveCompleted ? (
              <Typography variant="body2" color="text.secondary">
                Graduated{bondingCurveCompletedAt ? ` on ${bondingCurveCompletedAt}` : ''}
              </Typography>
            ) : (
              <>
                <LinearProgress
                  variant="determinate"
                  value={bondingCurveProgress}
                  sx={{ height: 8, borderRadius: 4, mb: 1 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {bondingCurveProgress.toFixed(1)}% to 69k USD target
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatSolFull(bondingCurveActualSol, 3)} in bonding curve
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {bondingCurveRemainingUsd !== undefined
                    ? `${formatUsdFull(bondingCurveRemainingUsd)} to graduate`
                    : `${formatSolFull(bondingCurveRemainingSol, 3)} SOL remaining`}
                </Typography>
              </>
            )}
          </Paper>

          {(remote?.creator || token.creatorAddress) && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Creator
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Avatar src={remote?.creator?.profile_image || undefined}>
                  {remote?.creator?.username?.charAt(0)?.toUpperCase() || token.symbol.charAt(0)}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1">
                    {remote?.creator?.username || shortenAddress(token.creatorAddress)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Followers: {remote?.creator?.followers ?? "N/A"}
                  </Typography>
                </Box>
              </Stack>
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  component="a"
                  href={`https://pump.fun/profile/${token.creatorAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Creator on Pump.fun
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  component="a"
                  href={`https://solscan.io/account/${token.creatorAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Creator on Solscan
                </Button>
              </Stack>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}
