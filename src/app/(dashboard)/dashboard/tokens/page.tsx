"use client";

import { useState, useEffect, useCallback } from "react";
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
  Divider,
  Stack,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TwitterIcon from "@mui/icons-material/Twitter";
import TelegramIcon from "@mui/icons-material/Telegram";
import LanguageIcon from "@mui/icons-material/Language";
import { useRouter } from "next/navigation";
import IconButton from "@mui/material/IconButton";

const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '6h', '24h', '7d', '30d', 'all'] as const;
type TimeframeOption = (typeof TIMEFRAME_OPTIONS)[number];
const TIMEFRAME_LABELS: Record<TimeframeOption, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '30m': '30 minutes',
  '1h': '1 hour',
  '6h': '6 hours',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
};

interface Token {
  id: string;
  mintAddress: string;
  symbol: string;
  name: string;
  imageUri: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  price: {
    priceSol: number;
    priceUsd: number;
    lastTradeTimestamp: number | null;
  } | null;
  createdAt: number;
  lastTradeTimestamp: number | null;
  kingOfTheHillTimestamp: number | null;
  completed: boolean;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  volumeRatio: number;
  uniqueTraders: number;
  buyVolumeSol?: number;
  sellVolumeSol?: number;
  totalVolumeSol?: number;
  totalSupplyTokens?: number;
  marketCapUsd?: number;
  marketCapSol?: number;
}

export default function TokensPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState("volume");
  const [timeframe, setTimeframe] = useState<TimeframeOption>('24h');

  const fetchTokens = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });
      if (search) {
        params.append("search", search);
      }
      if (sortBy) {
        params.append("sortBy", sortBy);
      }
      if (timeframe) {
        params.append("timeframe", timeframe);
      }

      const response = await fetch(`/api/tokens?${params}`);
      const data = await response.json();
      setTokens(data.tokens || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error("Error fetching tokens:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [page, search, sortBy, timeframe]);

  useEffect(() => {
    // Initial fetch with loading indicator
    fetchTokens(true);

    // Poll for updates every 5 seconds for real-time data (without loading indicator)
    const interval = setInterval(() => {
      fetchTokens(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchTokens]);

  const handleTimeframeChange = (value: TimeframeOption) => {
    setTimeframe(value);
    setPage(1);
  };

  const getCardColor = (volumeRatio: number) => {
    if (volumeRatio > 0.6) {
      // More green for higher buy volume - pump.fun style
      const intensity = Math.min((volumeRatio - 0.6) / 0.4, 1);
      return `rgba(0, 255, 136, ${0.15 + intensity * 0.25})`;
    } else if (volumeRatio < 0.4) {
      // More red for higher sell volume
      const intensity = Math.min((0.4 - volumeRatio) / 0.4, 1);
      return `rgba(255, 68, 68, ${0.15 + intensity * 0.25})`;
    }
    return "rgba(26, 26, 26, 1)";
  };

  const formatPricePerMillion = (priceUsd: number | null | undefined) => {
    // Check for null/undefined/NaN/zero
    if (priceUsd == null || isNaN(priceUsd) || priceUsd <= 0) {
      return "N/A";
    }

    // Convert to price per million tokens
    const pricePerMillion = priceUsd * 1_000_000;

    // Handle extremely small values (less than $0.000001 per million)
    if (
      pricePerMillion < 0.000001 ||
      isNaN(pricePerMillion) ||
      !isFinite(pricePerMillion)
    ) {
      return "N/A";
    }

    // Format the price
    if (pricePerMillion < 0.01) {
      // Show more precision for very small values - use scientific notation if too small
      if (pricePerMillion < 0.0001) {
        return `$${pricePerMillion.toExponential(2)}`;
      }
      return `$${pricePerMillion.toFixed(6).replace(/\.?0+$/, "")}`;
    } else if (pricePerMillion < 1000) {
      return `$${pricePerMillion.toFixed(2)}`;
    } else if (pricePerMillion < 1000000) {
      return `$${(pricePerMillion / 1000).toFixed(2)}K`;
    } else {
      return `$${(pricePerMillion / 1000000).toFixed(2)}M`;
    }
  };

  const formatSolPerMillion = (priceSol: number | null | undefined) => {
    if (priceSol == null || isNaN(priceSol) || priceSol <= 0) {
      return "N/A";
    }

    const solPerMillion = priceSol * 1_000_000;

    if (!isFinite(solPerMillion) || solPerMillion <= 0) {
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

  const formatTimeAgo = (
    timestamp: number | null | undefined,
    fallback = "N/A",
  ) => {
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

  const getKothLabel = (token: Token) => {
    if (token.completed) {
      return "Graduated";
    }
    if (token.kingOfTheHillTimestamp) {
      return `KOTH: Reached ${formatTimeAgo(token.kingOfTheHillTimestamp)}`;
    }
    return "KOTH: Not reached";
  };

  const formatVolume = (volume: number) => {
    if (volume === 0 || !volume) return "$0.00";
    if (volume < 0.01) return `$${volume.toFixed(4)}`;
    if (volume < 1000) return `$${volume.toFixed(2)}`;
    if (volume < 1000000) return `$${(volume / 1000).toFixed(2)}K`;
    return `$${(volume / 1000000).toFixed(2)}M`;
  };

  const formatVolumeSol = (volumeSol: number | undefined) => {
    if (!volumeSol || volumeSol === 0) return "0 SOL";
    if (volumeSol < 0.001) return `${volumeSol.toFixed(6)} SOL`;
    if (volumeSol < 1) return `${volumeSol.toFixed(4)} SOL`;
    if (volumeSol < 1000) return `${volumeSol.toFixed(2)} SOL`;
    return `${(volumeSol / 1000).toFixed(2)}K SOL`;
  };

  const formatMarketCapUsd = (value?: number) => {
    if (!value || value <= 0) return "N/A";
    return formatVolume(value);
  };

  const formatMarketCapSol = (value?: number) => {
    if (!value || value <= 0) return "N/A";
    return formatVolumeSol(value);
  };

  return (
    <Container maxWidth="lg">
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h4" component="h1">
          Tokens
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              label="Sort By"
              onChange={(e) => setSortBy(e.target.value)}
            >
              <MenuItem value="volume">Volume</MenuItem>
              <MenuItem value="traders">Traders</MenuItem>
              <MenuItem value="price">Price</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Timeframe</InputLabel>
            <Select
              value={timeframe}
              label="Timeframe"
              onChange={(e) => handleTimeframeChange(e.target.value as TimeframeOption)}
            >
              {TIMEFRAME_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {TIMEFRAME_LABELS[option]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Box>

      <TextField
        fullWidth
        placeholder="Search tokens..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
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
            Loading tokens...
          </Typography>
        </Box>
      ) : tokens.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No tokens found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {search
              ? "Try adjusting your search terms"
              : "Tokens will appear here once data is loaded"}
          </Typography>
        </Paper>
      ) : (
        <>
          <Grid container spacing={2}>
            {tokens.map((token) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={token.id}>
                <Card
                  sx={{
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: "0 8px 24px rgba(0, 255, 136, 0.2)",
                    },
                    backgroundColor: getCardColor(token.volumeRatio),
                    border: "2px solid",
                    borderColor:
                      token.volumeRatio > 0.6
                        ? "rgba(0, 255, 136, 0.3)"
                        : token.volumeRatio < 0.4
                          ? "rgba(255, 68, 68, 0.3)"
                          : "#333",
                    position: "relative",
                  }}
                  onClick={() =>
                    router.push(`/dashboard/tokens/${token.mintAddress}`)
                  }
                >
                  {token.completed && (
                    <Chip
                      label="Graduated"
                      color="primary"
                      size="small"
                      sx={{ position: "absolute", top: 12, right: 12 }}
                    />
                  )}
                  <CardContent
                    sx={{
                      p: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                      {token.imageUri ? (
                        <Box
                          component="img"
                          src={token.imageUri}
                          alt={token.name}
                          sx={{
                            width: 84,
                            height: 84,
                            borderRadius: "12px",
                            objectFit: "cover",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            border: "2px solid rgba(255, 255, 255, 0.08)",
                            display: "block",
                          }}
                          onError={(e: any) => {
                            e.target.style.display = "none";
                            const fallback =
                              e.target.parentElement?.querySelector(
                                ".token-fallback",
                              );
                            if (fallback) {
                              (fallback as HTMLElement).style.display = "flex";
                            }
                          }}
                        />
                      ) : null}
                      <Box
                        className="token-fallback"
                        sx={{
                          width: 84,
                          height: 84,
                          borderRadius: "12px",
                          backgroundColor: "rgba(255, 255, 255, 0.06)",
                          border: "2px solid rgba(255, 255, 255, 0.08)",
                          display: token.imageUri ? "none" : "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "30px",
                          fontWeight: "bold",
                          color: "text.secondary",
                        }}
                      >
                        {token.symbol.charAt(0)}
                      </Box>
                    </Box>

                    <Stack spacing={0.6} alignItems="center">
                      <Typography
                        variant="h6"
                        noWrap
                        sx={{ fontWeight: "bold" }}
                      >
                        {token.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {token.symbol}
                      </Typography>
                      {(token.twitter || token.telegram || token.website) && (
                        <Stack
                          direction="row"
                          spacing={0.75}
                          justifyContent="center"
                        >
                          {token.twitter && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                  token.twitter!,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              }}
                              sx={{
                                color: "text.secondary",
                                "&:hover": { color: "#1DA1F2" },
                                p: 0.4,
                              }}
                            >
                              <TwitterIcon fontSize="small" />
                            </IconButton>
                          )}
                          {token.telegram && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                  token.telegram!,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              }}
                              sx={{
                                color: "text.secondary",
                                "&:hover": { color: "#0088cc" },
                                p: 0.4,
                              }}
                            >
                              <TelegramIcon fontSize="small" />
                            </IconButton>
                          )}
                          {token.website && (
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                  token.website!,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              }}
                              sx={{
                                color: "text.secondary",
                                "&:hover": { color: "primary.main" },
                                p: 0.4,
                              }}
                            >
                              <LanguageIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      )}
                    </Stack>

                    <Stack
                      direction="row"
                      spacing={1.5}
                      justifyContent="center"
                      flexWrap="wrap"
                    >
                      <Box sx={{ textAlign: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          Price (per 1M)
                        </Typography>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 600 }}
                        >
                          {token.price && token.price.priceUsd != null
                            ? formatPricePerMillion(
                                Number(token.price.priceUsd),
                              )
                            : "N/A"}
                        </Typography>
                        {token.price &&
                          token.price.priceSol &&
                          Number(token.price.priceSol) > 0 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {formatSolPerMillion(
                                Number(token.price.priceSol),
                              )}
                            </Typography>
                          )}
                      </Box>
                      <Box sx={{ textAlign: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          Market Cap
                        </Typography>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: 600 }}
                        >
                          {token.marketCapUsd
                            ? formatMarketCapUsd(token.marketCapUsd)
                            : "N/A"}
                        </Typography>
                        {token.marketCapSol ? (
                          <Typography variant="caption" color="text.secondary">
                            {formatMarketCapSol(token.marketCapSol)}
                          </Typography>
                        ) : null}
                      </Box>
                    </Stack>

                    <Stack spacing={0.25} alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        Age: {formatTimeAgo(token.createdAt)} • Last:{" "}
                        {formatTimeAgo(token.lastTradeTimestamp, "No trades")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {getKothLabel(token)}
                      </Typography>
                    </Stack>

                    <Grid container spacing={1} columns={12}>
                      <Grid item xs={6}>
                        <Stack
                          spacing={0.25}
                          alignItems={{ xs: "center", sm: "flex-start" }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Buy
                          </Typography>
                          <Typography variant="body2">
                            {formatVolume(token.buyVolume)}
                            {token.buyVolumeSol
                              ? ` (${formatVolumeSol(token.buyVolumeSol)})`
                              : ""}
                          </Typography>
                        </Stack>
                      </Grid>
                      <Grid item xs={6}>
                        <Stack
                          spacing={0.25}
                          alignItems={{ xs: "center", sm: "flex-start" }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Sell
                          </Typography>
                          <Typography variant="body2">
                            {formatVolume(token.sellVolume)}
                            {token.sellVolumeSol
                              ? ` (${formatVolumeSol(token.sellVolumeSol)})`
                              : ""}
                          </Typography>
                        </Stack>
                      </Grid>
                      <Grid item xs={6}>
                        <Stack
                          spacing={0.25}
                          alignItems={{ xs: "center", sm: "flex-start" }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Total Vol
                          </Typography>
                          <Typography variant="body2">
                            {formatVolume(token.totalVolume)}
                            {token.totalVolumeSol
                              ? ` (${formatVolumeSol(token.totalVolumeSol)})`
                              : ""}
                          </Typography>
                        </Stack>
                      </Grid>
                      <Grid item xs={6}>
                        <Stack
                          spacing={0.25}
                          alignItems={{ xs: "center", sm: "flex-start" }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Traders
                          </Typography>
                          <Typography variant="body2">
                            {token.uniqueTraders}
                          </Typography>
                        </Stack>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {totalPages > 1 && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
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
  );
}
