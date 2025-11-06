"use client";

import { useState, useEffect, useMemo } from "react";
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
} from "@mui/material";
import { ShoppingCart, Sell } from "@mui/icons-material";
import PriceChart from "@/components/charts/PriceChart";
import VolumeChart from "@/components/charts/VolumeChart";

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

const selectMarketActivityBucket = (activity?: Record<string, MarketActivityBucket>) => {
  if (!activity) return undefined;
  return activity["24h"] || activity["6h"] || activity["1h"] || activity["5m"];
};

export default function TokenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const mintAddress = params.mintAddress as string;

  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [trading, setTrading] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState("");
  const [candleInterval, setCandleInterval] = useState<(typeof CANDLE_INTERVALS)[number]>('1m');
  const handleCandleIntervalChange = (_: unknown, value: (typeof CANDLE_INTERVALS)[number] | null) => {
    if (value) {
      setCandleInterval(value);
    }
  };


  useEffect(() => {
    fetchToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintAddress]);

  const fetchToken = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tokens/${mintAddress}`);
      if (!response.ok) {
        throw new Error("Token not found");
      }
      const data = await response.json();
      setToken(data);
    } catch (err: any) {
      setError(err.message || "Failed to load token");
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async () => {
    if (!buyAmount || parseFloat(buyAmount) <= 0 || !token) return;
    setTrading(true);
    setTradeSuccess("");
    setError("");

    try {
      const response = await fetch("/api/trading/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token.id,
          amountSol: parseFloat(buyAmount),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Buy failed");
      }

      setTradeSuccess(`Bought ${data.tokensReceived?.toFixed(2)} tokens!`);
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
    setTrading(true);
    setTradeSuccess("");
    setError("");

    try {
      const response = await fetch("/api/trading/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token.id,
          amountTokens: parseFloat(sellAmount),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Sell failed");
      }

      setTradeSuccess(`Sold for ${data.solReceived?.toFixed(4)} SOL!`);
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
  const fallbackActivity = useMemo(
    () => selectMarketActivityBucket(marketActivity),
    [marketActivity],
  );

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

  const totalSupplyTokens = token.totalSupplyTokens ?? (remote?.coin?.total_supply ? Number(remote.coin.total_supply) / 1_000_000_000 : undefined);
  const priceSol = token.price?.priceSol ?? 0;
  const priceUsd = token.price?.priceUsd ?? 0;
  const marketCapUsd = token.marketCapUsd ?? (remote?.coin?.usd_market_cap ? Number(remote.coin.usd_market_cap) : undefined);
  const marketCapSol = token.marketCapSol ?? (remote?.coin?.market_cap ? Number(remote.coin.market_cap) : undefined);

  const displayTotalVolumeUsd = token.stats.totalVolume && token.stats.totalVolume > 0
    ? token.stats.totalVolume
    : fallbackActivity?.volumeUSD ?? 0;
  const displayBuyVolumeUsd = token.stats.buyVolume && token.stats.buyVolume > 0
    ? token.stats.buyVolume
    : fallbackActivity?.buyVolumeUSD ?? 0;
  const displaySellVolumeUsd = token.stats.sellVolume && token.stats.sellVolume > 0
    ? token.stats.sellVolume
    : fallbackActivity?.sellVolumeUSD ?? 0;
  const displayUniqueTraders = token.stats.uniqueTraders && token.stats.uniqueTraders > 0
    ? token.stats.uniqueTraders
    : fallbackActivity?.numUsers ?? fallbackActivity?.numBuyers ?? fallbackActivity?.numSellers ?? 0;

  const sortedTopHolders = [...topHolders].sort((a, b) => (b.amountTokens ?? b.amount ?? 0) - (a.amountTokens ?? a.amount ?? 0));
  const sortedRemoteTrades = [...remoteTrades].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  const pumpCoinUrl = `https://pump.fun/coin/${token.mintAddress}`;
  const poolAddress = remote?.poolAddress || null;

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
                  {priceUsd > 0 ? formatUsd(priceUsd * 1_000_000) : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price (per 1M tokens - SOL)
                </Typography>
                <Typography variant="h5">{priceSol > 0 ? formatSolValue(priceSol * 1_000_000) : "N/A"}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Market Cap (USD)
                </Typography>
                <Typography variant="h5">{formatUsd(marketCapUsd)}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Market Cap (SOL)
                </Typography>
                <Typography variant="h5">{formatSolValue(marketCapSol)}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price per Token (USD)
                </Typography>
                <Typography variant="h6">
                  {priceUsd > 0 ? formatUsd(priceUsd) : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price per Token (SOL)
                </Typography>
                <Typography variant="h6">
                  {priceSol > 0 ? formatSolValue(priceSol) : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Total Supply
                </Typography>
                <Typography variant="h6">
                  {totalSupplyTokens ? `${formatCompactNumber(totalSupplyTokens)} tokens` : "N/A"}
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

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Simulation Snapshot
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Total Volume (USD)
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {formatUsd(displayTotalVolumeUsd)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Buy Volume
                </Typography>
                <Typography variant="body1">{formatUsd(displayBuyVolumeUsd)}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Sell Volume
                </Typography>
                <Typography variant="body1">{formatUsd(displaySellVolumeUsd)}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Unique Traders
                </Typography>
                <Typography variant="body1">{displayUniqueTraders}</Typography>
              </Grid>
            </Grid>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Amount (SOL)</TableCell>
                    <TableCell>Amount (USD)</TableCell>
                    <TableCell>Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {token.recentTrades.map((trade, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Chip
                          label={trade.type.toUpperCase()}
                          color={trade.type === "buy" ? "success" : "error"}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{trade.amountSol.toFixed(4)}</TableCell>
                      <TableCell>{formatUsd(trade.amountUsd)}</TableCell>
                      <TableCell>
                        {new Date(parseInt(trade.timestamp, 10)).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

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
          {(remote?.creator || token.creatorAddress) && (
            <Paper sx={{ p: 3, mb: 2 }}>
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

          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Buy
            </Typography>
            <TextField
              fullWidth
              label="Amount (SOL)"
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              fullWidth
              variant="contained"
              color="success"
              startIcon={<ShoppingCart />}
              onClick={handleBuy}
              disabled={trading || !buyAmount}
            >
              {trading ? "Buying..." : "Buy"}
            </Button>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Sell
            </Typography>
            <TextField
              fullWidth
              label="Amount (Tokens)"
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              fullWidth
              variant="contained"
              color="error"
              startIcon={<Sell />}
              onClick={handleSell}
              disabled={trading || !sellAmount}
            >
              {trading ? "Selling..." : "Sell"}
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
