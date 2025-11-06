"use client";

import { useState, useEffect } from "react";
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
} from "@mui/material";
import { ShoppingCart, Sell } from "@mui/icons-material";
import PriceChart from "@/components/charts/PriceChart";
import VolumeChart from "@/components/charts/VolumeChart";

const TIME_BUCKETS = ["5m", "1h", "6h", "24h"] as const;

type TimeBucketKey = (typeof TIME_BUCKETS)[number];

interface RemoteTopHolder {
  address: string;
  amount: number;
  solBalance: number;
}

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

interface RemoteData {
  poolAddress?: string | null;
  coin?: any;
  metadata?: any;
  trades?: any[];
  candles?: any[];
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
  remote?: RemoteData;
}

const formatCompactNumber = (value?: number, options: Intl.NumberFormatOptions = {}) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
};

const formatUsd = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  if (value < 1) return `$${value.toFixed(4)}`;
  if (value < 1_000) return `$${value.toFixed(2)}`;
  if (value < 1_000_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 1_000_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${(value / 1_000_000_000).toFixed(2)}B`;
};

const formatSolValue = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  if (value < 0.001) return `${value.toFixed(6)} SOL`;
  if (value < 1) return `${value.toFixed(4)} SOL`;
  if (value < 1_000) return `${value.toFixed(2)} SOL`;
  return `${(value / 1_000).toFixed(2)}K SOL`;
};

const formatPercent = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
};

const shortenAddress = (address?: string | null) => {
  if (!address) return "N/A";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
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

  const formatSolPerMillion = (priceSol?: number | null) => {
    if (priceSol == null || Number.isNaN(priceSol) || priceSol <= 0) {
      return "N/A";
    }

    const solPerMillion = priceSol * 1_000_000;

    if (!Number.isFinite(solPerMillion) || solPerMillion <= 0) {
      return "N/A";
    }

    if (solPerMillion >= 1000) {
      return `${(solPerMillion / 1000).toFixed(2)}K SOL`;
    }
    if (solPerMillion >= 1) {
      return `${solPerMillion.toFixed(2)} SOL`;
    }
    if (solPerMillion >= 0.01) {
      return `${solPerMillion.toFixed(4)} SOL`;
    }
    return `${solPerMillion.toExponential(2)} SOL`;
  };

  const formatTimeAgo = (timestamp?: number | null, fallback = "N/A") => {
    if (!timestamp || Number.isNaN(timestamp)) return fallback;

    const diff = Date.now() - timestamp;
    if (diff < 0) return "just now";

    const units = [
      { label: "day", ms: 86_400_000 },
      { label: "hour", ms: 3_600_000 },
      { label: "minute", ms: 60_000 },
      { label: "second", ms: 1_000 },
    ];

    for (const unit of units) {
      if (diff >= unit.ms) {
        const value = Math.floor(diff / unit.ms);
        return `${value} ${unit.label}${value !== 1 ? "s" : ""} ago`;
      }
    }

    return "just now";
  };

  useEffect(() => {
    fetchToken();
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
    if (!buyAmount || parseFloat(buyAmount) <= 0) return;
    setTrading(true);
    setTradeSuccess("");
    setError("");

    try {
      const response = await fetch("/api/trading/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token?.id,
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
    if (!sellAmount || parseFloat(sellAmount) <= 0) return;
    setTrading(true);
    setTradeSuccess("");
    setError("");

    try {
      const response = await fetch("/api/trading/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: token?.id,
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

  if (loading) {
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

  if (error && !token) {
    return (
      <Container maxWidth="lg">
        <Alert
          severity="error"
          sx={{
            mt: 2,
            backgroundColor: "#1a1a1a",
            border: "1px solid #ff4444",
            color: "#ff4444",
          }}
        >
          {error}
        </Alert>
      </Container>
    );
  }

  if (!token) return null;

  const remote = token.remote || {};
  const metadata = remote.metadata || null;
  const topHolders = (remote.topHolders || []).slice(0, 12);
  const remoteTradesRaw = (remote.trades || []).slice(0, 30);
  const marketActivity = remote.marketActivity || null;
  const creator = remote.creator || null;
  const coinDetails = remote.coin || null;

  const totalSupplyTokens = (() => {
    if (token.totalSupplyTokens && Number.isFinite(token.totalSupplyTokens)) {
      return token.totalSupplyTokens;
    }
    const rawSupply =
      coinDetails?.total_supply ||
      coinDetails?.totalSupply ||
      coinDetails?.supply ||
      metadata?.total_supply;
    const supplyNumber = Number(rawSupply);
    if (Number.isFinite(supplyNumber) && supplyNumber > 0) {
      return supplyNumber / 1_000_000_000;
    }
    return undefined;
  })();

  const marketCapUsd = token.price?.priceUsd && totalSupplyTokens
    ? token.price.priceUsd * totalSupplyTokens
    : undefined;
  const marketCapSol = token.price?.priceSol && totalSupplyTokens
    ? token.price.priceSol * totalSupplyTokens
    : undefined;

  const pumpCoinUrl = `https://pump.fun/coin/${token.mintAddress}`;
  const poolAddress = remote.poolAddress || null;
  const metadataLinks: Array<{ label: string; url: string }> = [];

  const addLink = (label: string, value?: string | null) => {
    if (!value) return;
    let url = value;
    if (label === "Twitter") {
      const handle = value.replace(/^@/, "");
      url = `https://twitter.com/${handle}`;
    } else if (label === "Telegram") {
      const handle = value.replace(/^@/, "");
      url = `https://t.me/${handle}`;
    } else if (!/^https?:/i.test(value)) {
      url = `https://${value}`;
    }
    metadataLinks.push({ label, url });
  };

  addLink("Website", metadata?.website || coinDetails?.website);
  addLink("Twitter", metadata?.twitter || coinDetails?.twitter);
  addLink("Telegram", metadata?.telegram || coinDetails?.telegram);

  const normalizedRemoteTrades = remoteTradesRaw
    .map((trade: any) => {
      const amountSol = Number(
        trade.amountSol ?? trade.solAmount ?? trade.quoteAmount ?? trade.amount_sol,
      );
      const amountUsd = Number(trade.amountUsd ?? trade.amount_usd);
      const priceSol = Number(trade.priceSol ?? trade.price_sol ?? trade.price);
      const priceUsd = Number(trade.priceUsd ?? trade.price_usd);
      const timestampValue =
        trade.timestamp || trade.time || trade.blockTime || trade.block_timestamp;
      const timestamp = timestampValue ? new Date(timestampValue).getTime() : null;

      if (!Number.isFinite(amountSol) && !Number.isFinite(amountUsd)) {
        return null;
      }

      return {
        type: (trade.type || "").toLowerCase() === "buy" ? "buy" : "sell",
        amountSol: Number.isFinite(amountSol) ? amountSol : undefined,
        amountUsd: Number.isFinite(amountUsd) ? amountUsd : undefined,
        priceSol: Number.isFinite(priceSol) ? priceSol : undefined,
        priceUsd: Number.isFinite(priceUsd) ? priceUsd : undefined,
        timestamp,
        tx: trade.tx || trade.signature || trade.transactionId || null,
      };
    })
    .filter(Boolean) as Array<{
      type: "buy" | "sell";
      amountSol?: number;
      amountUsd?: number;
      priceSol?: number;
      priceUsd?: number;
      timestamp: number | null;
      tx: string | null;
    }>;

  const marketBuckets: TimeBucketKey[] = TIME_BUCKETS.filter(
    (bucket) => marketActivity && marketActivity[bucket],
  );

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
            {token.completed && (
              <Chip label="Graduated" color="primary" size="small" />
            )}
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
            <Typography variant="h6" gutterBottom>
              Market Snapshot
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price (per 1M tokens)
                </Typography>
                <Typography variant="h5">
                  {token.price && token.price.priceUsd > 0
                    ? `$${(token.price.priceUsd * 1_000_000).toFixed(2)}`
                    : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price (per 1M tokens - SOL)
                </Typography>
                <Typography variant="h5">
                  {token.price && token.price.priceSol > 0
                    ? formatSolPerMillion(Number(token.price.priceSol))
                    : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Market Cap (USD)
                </Typography>
                <Typography variant="h5">
                  {formatUsd(marketCapUsd)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Market Cap (SOL)
                </Typography>
                <Typography variant="h5">
                  {formatSolValue(marketCapSol)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price per Token (USD)
                </Typography>
                <Typography variant="h6">
                  {token.price ? `$${token.price.priceUsd.toFixed(6)}` : "N/A"}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Price per Token (SOL)
                </Typography>
                <Typography variant="h6">
                  {token.price ? token.price.priceSol.toFixed(8) : "N/A"}
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
              <PriceChart tokenAddress={token.mintAddress} height={300} />
            </Box>
            <Box>
              <VolumeChart tokenAddress={token.mintAddress} height={150} />
            </Box>
          </Paper>

          {marketBuckets.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Market Activity
              </Typography>
              <Grid container spacing={2}>
                {marketBuckets.map((bucket) => {
                  const bucketData = marketActivity?.[bucket] || {};
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

          {topHolders.length > 0 && (
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
                    {topHolders.map((holder, index) => {
                      const share = totalSupplyTokens
                        ? (holder.amount / totalSupplyTokens) * 100
                        : undefined;
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
                          <TableCell align="right">
                            {formatCompactNumber(holder.amount)}
                          </TableCell>
                          <TableCell align="right">
                            {formatPercent(share)}
                          </TableCell>
                          <TableCell align="right">
                            {formatSolValue(holder.solBalance)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {normalizedRemoteTrades.length > 0 && (
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
                    {normalizedRemoteTrades.map((trade, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>
                          <Chip
                            label={trade.type.toUpperCase()}
                            color={trade.type === "buy" ? "success" : "error"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          {trade.amountSol !== undefined
                            ? trade.amountSol.toFixed(4)
                            : "-"}
                        </TableCell>
                        <TableCell align="right">
                          {trade.amountUsd !== undefined
                            ? `$${trade.amountUsd.toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell align="right">
                          {trade.priceSol !== undefined
                            ? trade.priceSol.toFixed(8)
                            : "-"}
                        </TableCell>
                        <TableCell align="right">
                          {trade.priceUsd !== undefined
                            ? `$${trade.priceUsd.toFixed(6)}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {trade.timestamp
                            ? new Date(trade.timestamp).toLocaleString()
                            : "-"}
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
                  {formatUsd(token.stats.totalVolume)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Buy Volume
                </Typography>
                <Typography variant="body1">
                  {formatUsd(token.stats.buyVolume)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Sell Volume
                </Typography>
                <Typography variant="body1">
                  {formatUsd(token.stats.sellVolume)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Unique Traders
                </Typography>
                <Typography variant="body1">
                  {token.stats.uniqueTraders}
                </Typography>
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
                      <TableCell>${trade.amountUsd.toFixed(2)}</TableCell>
                      <TableCell>
                        {new Date(parseInt(trade.timestamp, 10)).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {(metadata?.description || metadataLinks.length > 0) && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                About {token.name}
              </Typography>
              {metadata?.description ? (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {metadata.description}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No description available.
                </Typography>
              )}
              {metadataLinks.length > 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
                  {metadataLinks.map((link) => (
                    <Button
                      key={link.label}
                      variant="outlined"
                      size="small"
                      component="a"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                    </Button>
                  ))}
                </Stack>
              )}
            </Paper>
          )}
        </Grid>

        <Grid item xs={12} md={4}>
          {(creator || token.stats || coinDetails) && (
            <Paper sx={{ p: 3, mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Creator
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Avatar src={creator?.profile_image || undefined}>
                  {creator?.username?.charAt(0)?.toUpperCase() || token.symbol.charAt(0)}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1">
                    {creator?.username || shortenAddress(token.creatorAddress)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Followers: {creator?.followers ?? "N/A"}
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
