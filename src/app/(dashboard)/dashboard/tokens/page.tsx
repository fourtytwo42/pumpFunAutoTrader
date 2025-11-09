"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
  Typography,
  Box,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Pagination,
  FormControl,
  MenuItem,
  InputLabel,
  Paper,
  Divider,
  Stack,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  LinearProgress,
} from "@mui/material";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import { ElementType } from "react";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import UpdateIcon from "@mui/icons-material/Update";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import SearchIcon from "@mui/icons-material/Search";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TwitterIcon from "@mui/icons-material/Twitter";
import TelegramIcon from "@mui/icons-material/Telegram";
import LanguageIcon from "@mui/icons-material/Language";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";
import { useRouter } from "next/navigation";
import IconButton from "@mui/material/IconButton";

const TIMEFRAME_OPTIONS = ['1m', '2m', '5m', '10m', '15m', '30m', '60m'] as const;
type TimeframeOption = (typeof TIMEFRAME_OPTIONS)[number];
const TIMEFRAME_LABELS: Record<TimeframeOption, string> = {
  '1m': '1 minute',
  '2m': '2 minutes',
  '5m': '5 minutes',
  '10m': '10 minutes',
  '15m': '15 minutes',
  '30m': '30 minutes',
  '60m': '60 minutes',
};

const MARKET_CAP_MIN = 0;
const MARKET_CAP_MAX = 1_000_000;
const UNIQUE_TRADERS_MIN = 0;
const UNIQUE_TRADERS_MAX = 1_000;
const TRADE_AMOUNT_MIN = 0;
const TRADE_AMOUNT_MAX = 100;
const TOKEN_AGE_MIN_HOURS = 0;
const TOKEN_AGE_MAX_HOURS = 168; // 7 days
type GraduatedFilterValue = "all" | "bonding" | "graduated";
type KothFilterValue = "all" | "not_koth" | "koth";

const GRADUATED_FILTER_OPTIONS: Array<{ value: GraduatedFilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "bonding", label: "Bonding" },
  { value: "graduated", label: "Graduated" },
];

const KOTH_FILTER_OPTIONS: Array<{ value: KothFilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "not_koth", label: "Not KOTH" },
  { value: "koth", label: "KOTH" },
];

const DEFAULT_STATUS_FILTERS: { graduated: GraduatedFilterValue; koth: KothFilterValue } = {
  graduated: "all",
  koth: "all",
};

const PUMP_SEARCH_ENDPOINT = "/api/pump/search";
const TOKEN_METADATA_ENDPOINT = "/api/tokens";
const PINATA_IPFS_BASE = "https://pump.mypinata.cloud/ipfs/";
const BONDING_CURVE_TARGET_SOL = 415;

type FilterState = {
  marketCap: [number, number];
  uniqueTraders: [number, number];
  tradeAmount: [number, number];
  tokenAge: [number, number];
};

const DEFAULT_FILTERS: FilterState = {
  marketCap: [MARKET_CAP_MIN, MARKET_CAP_MAX],
  uniqueTraders: [1, UNIQUE_TRADERS_MAX],
  tradeAmount: [TRADE_AMOUNT_MIN, TRADE_AMOUNT_MAX],
  tokenAge: [TOKEN_AGE_MIN_HOURS, TOKEN_AGE_MAX_HOURS],
};

const normaliseIpfsUri = (uri?: string | null) => {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return `${PINATA_IPFS_BASE}${uri.replace("ipfs://", "")}`;
  }
  return uri;
};

const looksLikeMintPrefix = (value: string | null | undefined, mint: string) => {
  if (!value) return true;
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleaned) return true;
  if (cleaned.length < 3) return false;
  const mintUpper = mint.toUpperCase();
  return mintUpper.startsWith(cleaned);
};

const shouldHydrateToken = (token: Token) => {
  const name = token.name?.trim() ?? "";
  const symbol = token.symbol?.trim() ?? "";

  if (!name || !symbol) return true;
  if (looksLikeMintPrefix(name, token.mintAddress)) return true;
  if (looksLikeMintPrefix(symbol, token.mintAddress)) return true;
  if (!token.imageUri) return true;
  return false;
};

type PumpSearchCoin = {
  mint: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
  metadataUri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  createdTimestamp?: number;
  usdMarketCap?: number;
};

type RemoteMetadata = {
  name?: string | null;
  symbol?: string | null;
  imageUri?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
};

const fetchRemoteMetadata = async (mintAddress: string): Promise<RemoteMetadata | null> => {
  try {
    const response = await fetch(
      `${TOKEN_METADATA_ENDPOINT}/${encodeURIComponent(mintAddress)}/metadata`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      name: data.name ?? null,
      symbol: data.symbol ?? null,
      imageUri: data.imageUri ?? null,
      twitter: data.twitter ?? null,
      telegram: data.telegram ?? null,
      website: data.website ?? null,
    };
  } catch (error) {
    console.warn(`[tokens-page] Metadata proxy failed for ${mintAddress}:`, error);
    return null;
  }
};

const searchPumpTokens = async (term: string, limit = 120): Promise<PumpSearchCoin[]> => {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    term: trimmed,
    limit: Math.min(Math.max(limit, 1), 50).toString(),
  });

  const response = await fetch(`${PUMP_SEARCH_ENDPOINT}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Pump search proxy failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results as PumpSearchCoin[];
};

const clampValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string) => {
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  const numeric = parseInt(sanitized, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;

const mixHexColors = (fromHex: string, toHex: string, amount: number) => {
  const t = clampValue(amount, 0, 1);
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);

  return rgbToHex(
    Math.round(from.r + (to.r - from.r) * t),
    Math.round(from.g + (to.g - from.g) * t),
    Math.round(from.b + (to.b - from.b) * t)
  );
};

const hexToRgba = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const sanitizeRange = (
  candidate: unknown,
  min: number,
  max: number,
  fallback: [number, number]
): [number, number] => {
  if (!Array.isArray(candidate) || candidate.length !== 2) {
    return fallback;
  }
  let [start, end] = candidate.map((value) => Number(value));
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return fallback;
  }
  start = Math.min(Math.max(start, min), max);
  end = Math.min(Math.max(end, min), max);
  if (start > end) {
    [start, end] = [end, start];
  }
  return [start, end];
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
const metadataCacheRef = useRef<Map<string, RemoteMetadata>>(new Map());
const metadataInFlightRef = useRef<Set<string>>(new Set());
  const fetchSeqRef = useRef(0);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState("marketCap");
  const [timeframe, setTimeframe] = useState<TimeframeOption>('10m');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [statusFilters, setStatusFilters] = useState<{
    graduated: GraduatedFilterValue;
    koth: KothFilterValue;
  }>(DEFAULT_STATUS_FILTERS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("tokenFeedFilters");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      setFilters({
        marketCap: sanitizeRange(parsed?.marketCap, MARKET_CAP_MIN, MARKET_CAP_MAX, DEFAULT_FILTERS.marketCap),
        uniqueTraders: sanitizeRange(
          parsed?.uniqueTraders,
          UNIQUE_TRADERS_MIN,
          UNIQUE_TRADERS_MAX,
          DEFAULT_FILTERS.uniqueTraders
        ),
        tradeAmount: sanitizeRange(
          parsed?.tradeAmount,
          TRADE_AMOUNT_MIN,
          TRADE_AMOUNT_MAX,
          DEFAULT_FILTERS.tradeAmount
        ),
        tokenAge: sanitizeRange(
          parsed?.tokenAge,
          TOKEN_AGE_MIN_HOURS,
          TOKEN_AGE_MAX_HOURS,
          DEFAULT_FILTERS.tokenAge
        ),
      });
      const savedStatus = parsed?.statusFilters ?? {};
      const normalizeGraduated = (value: unknown): GraduatedFilterValue => {
        if (typeof value !== "string") return DEFAULT_STATUS_FILTERS.graduated;
        const lower = value.toLowerCase();
        if (lower === "bonding") return "bonding";
        if (lower === "graduated") return "graduated";
        return "all";
      };
      const normalizeKoth = (value: unknown): KothFilterValue => {
        if (typeof value !== "string") return DEFAULT_STATUS_FILTERS.koth;
        const lower = value.toLowerCase();
        if (lower === "koth") return "koth";
        if (lower === "not_koth" || lower === "notkoth" || lower === "non_koth") return "not_koth";
        return "all";
      };
      setStatusFilters({
        graduated: normalizeGraduated(savedStatus.graduated),
        koth: normalizeKoth(savedStatus.koth),
      });
    } catch (error) {
      console.warn("Failed to parse saved token feed filters:", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      "tokenFeedFilters",
      JSON.stringify({
        ...filters,
        statusFilters,
      })
    );
  }, [filters, statusFilters]);

  const handleTimeframeChange = (value: TimeframeOption) => {
    setTimeframe(value);
    setPage(1);
  };

  const handleGraduatedFilterChange = useCallback(
    (event: SelectChangeEvent<GraduatedFilterValue>) => {
      const value = event.target.value as GraduatedFilterValue;
      setStatusFilters((prev) => ({ ...prev, graduated: value }));
      setPage(1);
    },
    []
  );

  const handleKothFilterChange = useCallback(
    (event: SelectChangeEvent<KothFilterValue>) => {
      const value = event.target.value as KothFilterValue;
      setStatusFilters((prev) => ({ ...prev, koth: value }));
      setPage(1);
    },
    []
  );

  const handleRangeChange = useCallback(
    (key: keyof FilterState) => (_event: Event, newValue: number | number[]) => {
      if (!Array.isArray(newValue)) return;
      setFilters((prev) => ({
        ...prev,
        [key]: [Number(newValue[0]), Number(newValue[1])] as [number, number],
      }));
      setPage(1);
    },
    []
  );

const applyMetadataToToken = (token: Token, metadata?: RemoteMetadata | null) => {
  if (!metadata) return token;

  return {
    ...token,
    name: metadata.name ?? token.name,
    symbol: metadata.symbol ?? token.symbol,
    imageUri: normaliseIpfsUri(metadata.imageUri) ?? token.imageUri,
    twitter: metadata.twitter ?? token.twitter,
    telegram: metadata.telegram ?? token.telegram,
    website: metadata.website ?? token.website,
  };
};

const hydrateTokenMetadata = useCallback(
  (tokenList: Token[]) => {
    if (!Array.isArray(tokenList) || tokenList.length === 0) return;

    const tokensToFetch = tokenList.filter((token) => {
      if (!token) return false;

      const cached = metadataCacheRef.current.get(token.mintAddress);
      if (cached) {
        setTokens((prev) =>
          prev.map((existing) =>
            existing.mintAddress === token.mintAddress
              ? applyMetadataToToken(existing, cached)
              : existing
          )
        );
        return false;
      }

      if (metadataInFlightRef.current.has(token.mintAddress)) return false;
      return shouldHydrateToken(token);
    });

    if (tokensToFetch.length === 0) return;

    tokensToFetch.forEach((token) => {
      metadataInFlightRef.current.add(token.mintAddress);

      (async () => {
        try {
          const metadata = await fetchRemoteMetadata(token.mintAddress);
          if (!metadata) {
            return;
          }

          const normalised: RemoteMetadata = {
            ...metadata,
            imageUri: normaliseIpfsUri(metadata.imageUri),
          };
          metadataCacheRef.current.set(token.mintAddress, normalised);

          setTokens((prev) =>
            prev.map((existing) =>
              existing.mintAddress === token.mintAddress
                ? applyMetadataToToken(existing, normalised)
                : existing
            )
          );
        } catch (error) {
          console.warn(
            `[tokens-page] Failed to fetch metadata for ${token.mintAddress}:`,
            error
          );
        } finally {
          metadataInFlightRef.current.delete(token.mintAddress);
        }
      })();
    });
  },
  []
);

  const fetchTokens = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      const fetchId = (fetchSeqRef.current += 1);

      try {
        const trimmedSearch = search.trim();
        const params = new URLSearchParams();
        params.set("limit", "20");
        params.set("sortBy", sortBy);
        params.set("timeframe", timeframe);

        const appendFilterParams = () => {
          if (filters.marketCap[0] > MARKET_CAP_MIN) {
            params.set("marketCapMin", Math.round(filters.marketCap[0]).toString());
          }
          if (filters.marketCap[1] < MARKET_CAP_MAX) {
            params.set("marketCapMax", Math.round(filters.marketCap[1]).toString());
          }
          if (filters.uniqueTraders[0] > UNIQUE_TRADERS_MIN) {
            params.set("uniqueTradersMin", Math.round(filters.uniqueTraders[0]).toString());
          }
          if (filters.uniqueTraders[1] < UNIQUE_TRADERS_MAX) {
            params.set("uniqueTradersMax", Math.round(filters.uniqueTraders[1]).toString());
          }
          if (filters.tradeAmount[0] > TRADE_AMOUNT_MIN) {
            params.set("tradeAmountMin", filters.tradeAmount[0].toString());
          }
          if (filters.tradeAmount[1] < TRADE_AMOUNT_MAX) {
            params.set("tradeAmountMax", filters.tradeAmount[1].toString());
          }
          if (filters.tokenAge[0] > TOKEN_AGE_MIN_HOURS) {
            params.set("tokenAgeMin", filters.tokenAge[0].toString());
          }
          if (filters.tokenAge[1] < TOKEN_AGE_MAX_HOURS) {
            params.set("tokenAgeMax", filters.tokenAge[1].toString());
          }
        };

        let remoteSearchResults: PumpSearchCoin[] = [];
        let mintList: string[] | null = null;

        if (trimmedSearch.length >= 2) {
          try {
            remoteSearchResults = await searchPumpTokens(trimmedSearch, 20);
            if (remoteSearchResults.length > 0) {
              mintList = remoteSearchResults.map((result) => result.mint);
              params.set("mints", mintList.join(","));
              params.set("limit", mintList.length.toString());
            }
          } catch (error) {
            console.warn("[tokens-page] Pump search failed:", error);
          }
        }

        if (mintList) {
          appendFilterParams();
        } else {
          params.set("page", page.toString());
          if (trimmedSearch.length > 0) {
            params.set("search", trimmedSearch);
          }
          appendFilterParams();
        }
      if (statusFilters.graduated !== "all") {
        params.set("graduated", statusFilters.graduated);
      }
      if (statusFilters.koth !== "all") {
        params.set("koth", statusFilters.koth);
      }

        const response = await fetch(`/api/tokens?${params.toString()}`);
        const data = await response.json();

        let tokensResult: Token[] = data.tokens || [];

        if (mintList && remoteSearchResults.length > 0) {
          const remoteMap = new Map(remoteSearchResults.map((result) => [result.mint, result]));
          const dbTokenMap = new Map(tokensResult.map((token) => [token.mintAddress, token]));

          tokensResult = mintList
            .map((mint) => {
              const dbToken = dbTokenMap.get(mint);
              const remote = remoteMap.get(mint);

              const metadata =
                metadataCacheRef.current.get(mint) ??
                (remote
                  ? {
                      name: remote.name ?? null,
                      symbol: remote.symbol ?? null,
                      imageUri: normaliseIpfsUri(remote.imageUri ?? null),
                      twitter: remote.twitter ?? null,
                      telegram: remote.telegram ?? null,
                      website: remote.website ?? null,
                    }
                  : null);

              if (metadata) {
                metadataCacheRef.current.set(mint, metadata);
              }

              if (dbToken) {
                return applyMetadataToToken(dbToken, metadata);
              }

              if (!remote) {
                return null;
              }

              const baseToken: Token = {
                id: `search-${mint}`,
                mintAddress: mint,
                name: mint.slice(0, 6),
                symbol: mint.slice(0, 6).toUpperCase(),
                imageUri: null,
                twitter: null,
                telegram: null,
                website: null,
                price: null,
                createdAt: Number(remote.createdTimestamp ?? Date.now()),
                lastTradeTimestamp: null,
                kingOfTheHillTimestamp: null,
                completed: false,
                buyVolume: 0,
                sellVolume: 0,
                totalVolume: 0,
                volumeRatio: 0.5,
                uniqueTraders: 0,
                buyVolumeSol: 0,
                sellVolumeSol: 0,
                totalVolumeSol: 0,
                totalSupplyTokens: undefined,
                marketCapUsd: remote.usdMarketCap ?? undefined,
                marketCapSol: undefined,
              };

              return applyMetadataToToken(baseToken, metadata);
            })
            .filter((token): token is Token => Boolean(token));

          if (fetchId === fetchSeqRef.current) {
            setTotalPages(tokensResult.length > 0 ? 1 : 0);
          }
        } else if (fetchId === fetchSeqRef.current) {
          setTotalPages(data.pagination?.totalPages || 1);
        }

        if (fetchId === fetchSeqRef.current) {
          const nowTs = Date.now();
          const withCachedMetadata = tokensResult
            .map((token) =>
              applyMetadataToToken(token, metadataCacheRef.current.get(token.mintAddress) ?? null)
            )
            .filter(
              (tokenEntry) =>
                matchesStatusFilters(tokenEntry, statusFilters) &&
                matchesNumericFilters(tokenEntry, filters, nowTs)
            );

          setTokens(withCachedMetadata);
          hydrateTokenMetadata(withCachedMetadata);
        }
      } catch (error) {
        console.error("Error fetching tokens:", error);
      } finally {
        if (showLoading && fetchId === fetchSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [filters, page, search, sortBy, timeframe, statusFilters, hydrateTokenMetadata]
  );

  useEffect(() => {
    const shouldPoll = search.trim().length === 0;

    fetchTokens(true);

    if (!shouldPoll) {
      return () => {};
    }

    const interval = setInterval(() => {
      fetchTokens(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchTokens, search]);
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

const clampPercentage = (value: number) => Math.min(Math.max(value, 0), 100);

const getGraduationProgress = (token: Token, solPriceUsdOverride?: number) => {
  if (token.completed) return 100;
  const marketCap = token.marketCapUsd ?? 0;
  const priceSol = token.price?.priceSol ? Number(token.price.priceSol) : 0;
  const priceUsd = token.price?.priceUsd ? Number(token.price.priceUsd) : 0;

  const derivedSolPriceUsd =
    priceSol > 0 && priceUsd > 0 ? priceUsd / priceSol : undefined;
  const solPriceUsd =
    solPriceUsdOverride && solPriceUsdOverride > 0
      ? solPriceUsdOverride
      : derivedSolPriceUsd ?? 0;

  const graduationUsd = solPriceUsd > 0 ? BONDING_CURVE_TARGET_SOL * solPriceUsd : 0;
  if (!Number.isFinite(marketCap) || marketCap <= 0 || graduationUsd <= 0) {
    return 0;
  }
  return clampPercentage((marketCap / graduationUsd) * 100);
};

const matchesStatusFilters = (
  token: Token,
  statusFilters: { graduated: GraduatedFilterValue; koth: KothFilterValue }
) => {
  const isGraduated = !!token.completed;
  const isKoth = token.kingOfTheHillTimestamp != null;

  if (statusFilters.graduated === "bonding" && isGraduated) return false;
  if (statusFilters.graduated === "graduated" && !isGraduated) return false;
  if (statusFilters.koth === "koth" && !isKoth) return false;
  if (statusFilters.koth === "not_koth" && isKoth) return false;

  return true;
};

const matchesNumericFilters = (token: Token, filters: FilterState, now = Date.now()) => {
  const marketCap = token.marketCapUsd ?? 0;
  const traders = token.uniqueTraders ?? 0;
  const ageMs = token.createdAt ? now - token.createdAt : undefined;

  if (filters.marketCap[0] > MARKET_CAP_MIN && marketCap < filters.marketCap[0]) return false;
  if (filters.marketCap[1] < MARKET_CAP_MAX && marketCap > filters.marketCap[1]) return false;
  if (filters.uniqueTraders[0] > UNIQUE_TRADERS_MIN && traders < filters.uniqueTraders[0]) return false;
  if (filters.uniqueTraders[1] < UNIQUE_TRADERS_MAX && traders > filters.uniqueTraders[1]) return false;
  const totalVolumeSol = token.totalVolumeSol ?? 0;
  if (filters.tradeAmount[0] > TRADE_AMOUNT_MIN && totalVolumeSol < filters.tradeAmount[0]) return false;
  if (filters.tradeAmount[1] < TRADE_AMOUNT_MAX && totalVolumeSol > filters.tradeAmount[1]) return false;

  const minAgeHours = filters.tokenAge[0];
  const maxAgeHours = filters.tokenAge[1];
  if (minAgeHours > TOKEN_AGE_MIN_HOURS) {
    const minAgeMs = minAgeHours * 60 * 60 * 1000;
    if (ageMs == null || ageMs < minAgeMs) return false;
  }
  if (maxAgeHours < TOKEN_AGE_MAX_HOURS) {
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    if (ageMs == null || ageMs > maxAgeMs) return false;
  }

  return true;
};

const formatAge = (hours: number) => {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "0h";
  }

  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min${minutes === 1 ? "" : "s"}`;
  }

  const wholeHours = Math.round(hours);
  if (wholeHours < 24) {
    return `${wholeHours}h`;
  }

  const days = Math.floor(wholeHours / 24);
  const remainingHours = wholeHours % 24;
  if (remainingHours === 0) {
    return `${days}d`;
  }
  return `${days}d ${remainingHours}h`;
};

  const renderUsdMetric = (
    label: string,
    usdValue: number | undefined,
    solValue: number | undefined,
    highlight?: boolean
  ) => {
    const usd = usdValue ?? 0;
    const sol = solValue ?? 0;
    const tooltipTitle =
      sol > 0 ? `${formatVolumeSol(sol)} (SOL)` : "No SOL data";

    return (
      <Stack spacing={0.5} alignItems="flex-start">
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: highlight ? 600 : 500 }}
        >
          {label}
        </Typography>
        <Tooltip title={tooltipTitle} arrow disableHoverListener={sol <= 0}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              color: highlight ? "#31F28C" : "inherit",
            }}
          >
            {formatVolume(usd)}
          </Typography>
        </Tooltip>
      </Stack>
    );
  };

  const getVolumeVisuals = useCallback(
    (buyVolume?: number, sellVolume?: number) => {
      const buy = buyVolume ?? 0;
      const sell = sellVolume ?? 0;
      const total = buy + sell;

      if (total <= 0) {
        return {
          border: "#222a3c",
          background: "linear-gradient(160deg, #111623 0%, #111623 100%)",
          shadow: "none",
          hoverShadow: "none",
          hoverBorder: "#2f3b54",
        };
      }

      const diff = buy - sell;
      const absDiff = Math.abs(diff);

      if (absDiff === 0) {
        return {
          border: "#2c3145",
          background: "linear-gradient(160deg, #111623 0%, #111623 100%)",
          shadow: "none",
          hoverShadow: "none",
          hoverBorder: "#39425c",
        };
      }

      const direction = diff >= 0 ? "buy" : "sell";
      const diffRatio = total === 0 ? 0 : absDiff / total;
      const magnitudeFactor = clampValue(Math.log10(total + 10) / 5, 0, 1);
      const intensity = clampValue(
        0.15 + diffRatio * 0.55 + magnitudeFactor * 0.35,
        0.15,
        1
      );

      const palette =
        direction === "buy"
          ? {
              borderStart: "#153127",
              borderEnd: "#31F28C",
              backgroundStart: "#101A15",
              backgroundEnd: "#123527",
              glow: "#31F28C",
            }
          : {
              borderStart: "#351919",
              borderEnd: "#FF5C5C",
              backgroundStart: "#1A1111",
              backgroundEnd: "#321818",
              glow: "#FF5C5C",
            };

      const border = mixHexColors(palette.borderStart, palette.borderEnd, intensity);
      const backgroundTint = mixHexColors(
        palette.backgroundStart,
        palette.backgroundEnd,
        intensity * 0.75
      );
      const hoverBorder = mixHexColors(
        border,
        palette.borderEnd,
        clampValue(intensity + 0.2, 0, 1)
      );
      const emphasize =
        diffRatio >= 0.6 || (diffRatio >= 0.45 && magnitudeFactor >= 0.6);
      const glow = emphasize
        ? hexToRgba(palette.glow, 0.16 + intensity * 0.22)
        : "transparent";
      const hoverGlow = emphasize
        ? hexToRgba(palette.glow, 0.24 + intensity * 0.22)
        : glow;

      return {
        border,
        background: `linear-gradient(160deg, #111623 0%, ${backgroundTint} 100%)`,
        shadow: emphasize
          ? `0 18px 42px rgba(0,0,0,0.26), 0 0 26px ${glow}`
          : "none",
        hoverShadow: emphasize
          ? `0 32px 68px rgba(0,0,0,0.36), 0 0 40px ${hoverGlow}`
          : "none",
        hoverBorder,
      };
    },
    []
  );

  const formatRangeLabel = (
    range: [number, number],
    formatter: (value: number) => string,
    maxLimit: number
  ) => {
    const [minValue, maxValue] = range;
    const minLabel = formatter(minValue);
    const maxLabel =
      maxValue >= maxLimit ? `${formatter(maxValue)}+` : formatter(maxValue);
    return `${minLabel} – ${maxLabel}`;
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
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SettingsIcon />}
            sx={{
              textTransform: "none",
              borderColor: "rgba(255,255,255,0.12)",
            }}
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </Button>
          <Typography variant="h4" component="h1">
            Tokens
          </Typography>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sort By</InputLabel>
            <Select
              value={sortBy}
              label="Sort By"
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="marketCap">Market Cap</MenuItem>
              <MenuItem value="totalVolume">Total Volume</MenuItem>
              <MenuItem value="buyVolume">Buy Volume</MenuItem>
              <MenuItem value="sellVolume">Sell Volume</MenuItem>
              <MenuItem value="uniqueTraders">Unique Traders</MenuItem>
              <MenuItem value="tokenAge">Token Age</MenuItem>
              <MenuItem value="lastTrade">Last Trade</MenuItem>
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
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Graduated</InputLabel>
            <Select
              value={statusFilters.graduated}
              label="Graduated"
              onChange={handleGraduatedFilterChange}
            >
              {GRADUATED_FILTER_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>KOTH</InputLabel>
            <Select value={statusFilters.koth} label="KOTH" onChange={handleKothFilterChange}>
              {KOTH_FILTER_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
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
            {tokens.map((token) => {
              const visuals = getVolumeVisuals(token.buyVolume, token.sellVolume);
              const priceSol = token.price?.priceSol ? Number(token.price.priceSol) : 0;
              const priceUsd = token.price?.priceUsd ? Number(token.price.priceUsd) : 0;
              const solPriceUsd = priceSol > 0 && priceUsd > 0 ? priceUsd / priceSol : 0;
              const graduationProgress = getGraduationProgress(token, solPriceUsd);
              const graduationTargetLabel =
                solPriceUsd > 0 ? formatVolume(solPriceUsd * BONDING_CURVE_TARGET_SOL) : "N/A";
              const createdAgo = formatTimeAgo(token.createdAt);
              const lastActivityAgo = formatTimeAgo(token.lastTradeTimestamp, "No trades");
              const graduatedAgo =
                token.completed && token.kingOfTheHillTimestamp
                  ? formatTimeAgo(token.kingOfTheHillTimestamp, "just now")
                  : token.completed
                    ? "Completed"
                    : null;
              const graduationLabel = graduatedAgo ?? "Graduated";
              const hasSocials = token.twitter || token.telegram || token.website;
              const timelineItems: Array<{
                key: string;
                label: string;
                value: string;
                icon: ElementType;
                accent?: boolean;
              }> = [
                {
                  key: "created",
                  label: "Created",
                  value: createdAgo,
                  icon: CalendarTodayIcon,
                },
                {
                  key: "last",
                  label: "Last Activity",
                  value: lastActivityAgo,
                  icon: UpdateIcon,
                },
              ];
              if (graduatedAgo) {
                timelineItems.push({
                  key: "graduated",
                  label: "Graduated",
                  value: graduatedAgo,
                  icon: EmojiEventsIcon,
                  accent: true,
                });
              }
              const timelineColSize = timelineItems.length === 3 ? 4 : 6;
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={token.id}>
                  <Card
                    onClick={() =>
                      router.push(`/dashboard/tokens/${token.mintAddress}`)
                    }
                    sx={{
                      cursor: "pointer",
                      transition: "all 0.25s ease",
                      height: "100%",
                      minHeight: 330,
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: 3,
                      overflow: "hidden",
                      border: "1px solid",
                      borderColor: visuals.border,
                      background: visuals.background,
                      boxShadow: visuals.shadow,
                      "&:hover": {
                        transform: "translateY(-6px)",
                        borderColor: visuals.hoverBorder,
                        boxShadow: visuals.hoverShadow,
                      },
                    }}
                  >
                    <CardContent
                      sx={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        p: { xs: 2.25, md: 2.75 },
                        gap: 2,
                      }}
                    >
                    <Box
                      sx={{
                        position: "relative",
                        borderRadius: 2,
                        overflow: "hidden",
                        height: 180,
                        width: "100%",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {token.imageUri ? (
                        <Box
                          component="img"
                          src={token.imageUri}
                          alt={token.name}
                          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e: any) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Typography variant="h3" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>
                            {token.symbol?.charAt(0) ?? "?"}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    <Stack spacing={1.6}>
                      <Tooltip title={token.name} placement="top" arrow>
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            lineHeight: 1.2,
                            maxWidth: "100%",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {token.name}
                        </Typography>
                      </Tooltip>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          label={token.symbol}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            letterSpacing: 0.6,
                            textTransform: "uppercase",
                            backgroundColor: "rgba(255,255,255,0.06)",
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {token.mintAddress.slice(0, 4)}…{token.mintAddress.slice(-4)}
                        </Typography>
                      </Stack>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          minHeight: 38,
                          alignItems: "center",
                        }}
                      >
                        {token.twitter ? (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(token.twitter!, "_blank", "noopener,noreferrer");
                            }}
                            sx={{
                              width: 34,
                              height: 34,
                              backgroundColor: "rgba(255,255,255,0.06)",
                              color: "#7C8DB5",
                              borderRadius: "12px",
                              "&:hover": {
                                backgroundColor: "rgba(29,161,242,0.16)",
                                color: "#1DA1F2",
                              },
                            }}
                          >
                            <TwitterIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <Box sx={{ width: 34, height: 34 }} />
                        )}
                        {token.telegram ? (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(token.telegram!, "_blank", "noopener,noreferrer");
                            }}
                            sx={{
                              width: 34,
                              height: 34,
                              backgroundColor: "rgba(255,255,255,0.06)",
                              color: "#7C8DB5",
                              borderRadius: "12px",
                              "&:hover": {
                                backgroundColor: "rgba(0,136,204,0.18)",
                                color: "#0088cc",
                              },
                            }}
                          >
                            <TelegramIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <Box sx={{ width: 34, height: 34 }} />
                        )}
                        {token.website ? (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(token.website!, "_blank", "noopener,noreferrer");
                            }}
                            sx={{
                              width: 34,
                              height: 34,
                              backgroundColor: "rgba(255,255,255,0.06)",
                              color: "#7C8DB5",
                              borderRadius: "12px",
                              "&:hover": {
                                backgroundColor: "rgba(0,255,136,0.16)",
                                color: "primary.main",
                              },
                            }}
                          >
                            <LanguageIcon fontSize="small" />
                          </IconButton>
                        ) : (
                          <Box sx={{ width: 34, height: 34 }} />
                        )}
                      </Stack>
                    </Stack>

                    <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />

                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        {renderUsdMetric(
                          "Market Cap",
                          token.marketCapUsd,
                          token.marketCapSol,
                          true
                        )}
                      </Grid>
                      <Grid item xs={6}>
                        <Stack spacing={0.5} alignItems="flex-start">
                          <Typography variant="caption" color="text.secondary">
                            Price (per 1M)
                          </Typography>
                          <Tooltip
                            title={
                              token.price?.priceSol
                                ? `${formatSolPerMillion(Number(token.price.priceSol))} (SOL)`
                                : 'No SOL data'
                            }
                            arrow
                            disableHoverListener={!token.price?.priceSol}
                          >
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {token.price && token.price.priceUsd != null
                                ? formatPricePerMillion(Number(token.price.priceUsd))
                                : "N/A"}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </Grid>
                      <Grid item xs={6}>
                        {renderUsdMetric(
                          "Buy Volume",
                          token.buyVolume,
                          token.buyVolumeSol
                        )}
                      </Grid>
                      <Grid item xs={6}>
                        {renderUsdMetric(
                          "Sell Volume",
                          token.sellVolume,
                          token.sellVolumeSol
                        )}
                      </Grid>
                      <Grid item xs={6}>
                        {renderUsdMetric(
                          "Total Volume",
                          token.totalVolume,
                          token.totalVolumeSol
                        )}
                      </Grid>
                      <Grid item xs={6}>
                        <Stack spacing={0.5} alignItems="flex-start">
                          <Typography variant="caption" color="text.secondary">
                            Unique Traders
                          </Typography>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {token.uniqueTraders}
                          </Typography>
                        </Stack>
                      </Grid>
                    </Grid>

                    <Stack
                      spacing={0.9}
                      sx={{
                        px: 1.5,
                        py: 1.25,
                        borderRadius: 2,
                        backgroundColor: "rgba(255,255,255,0.035)",
                        border: token.completed
                          ? "1px solid rgba(49,242,140,0.24)"
                          : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography
                          variant="caption"
                          color={token.completed ? "#31F28C" : "text.secondary"}
                          sx={{ fontWeight: 600 }}
                        >
                          {token.completed ? "Graduated" : "Bonding Curve Progress"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          {token.completed ? graduationLabel : `${graduationProgress.toFixed(1)}%`}
                        </Typography>
                      </Stack>
                      {token.completed ? (
                        <Box
                          sx={{
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 999,
                            backgroundColor: "rgba(49,242,140,0.08)",
                            border: "1px solid rgba(49,242,140,0.16)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            alignSelf: "flex-start",
                            color: "#31F28C",
                            fontWeight: 600,
                          }}
                        >
                          {graduationLabel}
                        </Box>
                      ) : (
                        <>
                          <LinearProgress
                            variant="determinate"
                            value={graduationProgress}
                            sx={{
                              height: 8,
                              borderRadius: "999px",
                              backgroundColor: "rgba(255,255,255,0.08)",
                              "& .MuiLinearProgress-bar": {
                                borderRadius: "999px",
                                background:
                                  graduationProgress >= 100
                                    ? "linear-gradient(90deg, #31F28C, #5CFAE3)"
                                    : "linear-gradient(90deg, #17C671, #31F28C)",
                              },
                            }}
                          />
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="caption" color="text.secondary">
                              {token.marketCapUsd !== undefined && token.marketCapUsd > 0
                                ? `Market Cap: ${formatVolume(token.marketCapUsd)}`
                                : "Market cap data unavailable"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                              Target: {graduationTargetLabel}
                            </Typography>
                          </Stack>
                        </>
                      )}
                    </Stack>

                    <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />

                    <Grid container spacing={1.2}>
                      {timelineItems.map((item) => {
                        const IconComponent = item.icon;
                        return (
                          <Grid item xs={timelineColSize} key={`${token.id}-${item.key}`}>
                            <Box
                              sx={{
                                height: "100%",
                                p: 1.25,
                                borderRadius: 2,
                                backgroundColor: item.accent ? "rgba(49,242,140,0.1)" : "rgba(255,255,255,0.035)",
                                border: `1px solid ${
                                  item.accent ? "rgba(49,242,140,0.3)" : "rgba(255,255,255,0.06)"
                                }`,
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.6,
                              }}
                            >
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Box
                                  sx={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: "50%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: item.accent
                                      ? "rgba(49,242,140,0.18)"
                                      : "rgba(255,255,255,0.07)",
                                  }}
                                >
                                  <IconComponent
                                    sx={{
                                      fontSize: 16,
                                      color: item.accent ? "#31F28C" : "rgba(255,255,255,0.72)",
                                    }}
                                  />
                                </Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, letterSpacing: 0.3 }}>
                                  {item.label}
                                </Typography>
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {item.value}
                              </Typography>
                            </Box>
                          </Grid>
                        );
                      })}
                    </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
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

      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            backgroundColor: "#08090B",
            color: "inherit",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.08)",
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pr: 1,
            pb: 1,
          }}
        >
          <Stack spacing={0.5}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Token Feed Settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Control which tokens appear in the feed by adjusting market cap, trader counts,
              trade sizes, and token age.
            </Typography>
          </Stack>
          <IconButton
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
            sx={{ color: "text.secondary" }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ px: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Market Cap Range
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {formatRangeLabel(filters.marketCap, formatVolume, MARKET_CAP_MAX)}
              </Typography>
              <Slider
                value={filters.marketCap}
                min={MARKET_CAP_MIN}
                max={MARKET_CAP_MAX}
                step={1000}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => formatVolume(value)}
                onChange={handleRangeChange("marketCap")}
              />
            </Box>

            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Unique Traders Range
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {formatRangeLabel(
                  filters.uniqueTraders,
                  (value) => value.toLocaleString(),
                  UNIQUE_TRADERS_MAX
                )}
              </Typography>
              <Slider
                value={filters.uniqueTraders}
                min={UNIQUE_TRADERS_MIN}
                max={UNIQUE_TRADERS_MAX}
                step={1}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => value.toLocaleString()}
                onChange={handleRangeChange("uniqueTraders")}
              />
            </Box>

            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Trade Amount Range (SOL)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {formatRangeLabel(filters.tradeAmount, formatVolumeSol, TRADE_AMOUNT_MAX)}
              </Typography>
              <Slider
                value={filters.tradeAmount}
                min={TRADE_AMOUNT_MIN}
                max={TRADE_AMOUNT_MAX}
                step={0.1}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value.toFixed(1)} SOL`}
                onChange={handleRangeChange("tradeAmount")}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Only count traders whose individual trades fall within this SOL range.
              </Typography>
            </Box>

            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Token Age Range
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {formatRangeLabel(filters.tokenAge, formatAge, TOKEN_AGE_MAX_HOURS)}
              </Typography>
              <Slider
                value={filters.tokenAge}
                min={TOKEN_AGE_MIN_HOURS}
                max={TOKEN_AGE_MAX_HOURS}
                step={1}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => formatAge(Number(value))}
                onChange={handleRangeChange("tokenAge")}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                Filter tokens based on how long ago they were created. Maximum range covers the last 7 days.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="contained" onClick={() => setSettingsOpen(false)} sx={{ textTransform: "none" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
