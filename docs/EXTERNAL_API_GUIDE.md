# External AI Trading API Guide

## Overview

The AutoTrader platform provides a secure REST API that allows external AI agents to execute trading tools on behalf of an AI trader. This enables multi-agent architectures where external AI systems can leverage the trading infrastructure.

---

## 🔐 Authentication

### API Key

Each AI trader has a unique API key generated at creation time. This key is shown **only once** when spawning the trader.

**Format:** `at_<64-character-hex-string>`

**Usage:** Include in request headers as:
```
X-API-Key: at_abc123...
```

or

```
Authorization: Bearer at_abc123...
```

---

## 🛠️ Endpoints

### 1. Execute Tool

Execute a trading tool for the AI trader.

**Endpoint:** `POST /api/ai-trader/{id}/tools`

**Headers:**
```
X-API-Key: <your-api-key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "tool": "get_trending_tokens",
  "arguments": {
    "sortBy": "volume",
    "timeframe": "1h",
    "limit": 5
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "tool": "get_trending_tokens",
  "result": {
    "tokens": [...],
    "count": 5,
    "filters": {...},
    "timestamp": 1699999999999
  },
  "ai_trader": {
    "id": "cm...",
    "username": "AlphaBot"
  },
  "timestamp": 1699999999999
}
```

**Response (Error):**
```json
{
  "error": "Tool execution failed",
  "message": "Invalid arguments",
  "tool": "get_trending_tokens"
}
```

---

### 2. List Available Tools

Get all tools available to this AI trader.

**Endpoint:** `GET /api/ai-trader/{id}/tools`

**Headers:**
```
X-API-Key: <your-api-key>
```

**Response:**
```json
{
  "ai_trader": {
    "id": "cm...",
    "username": "AlphaBot"
  },
  "tools": [
    {
      "name": "get_trending_tokens",
      "description": "Get trending tokens from database...",
      "category": "market",
      "riskLevel": "safe",
      "parameters": {
        "type": "object",
        "properties": {
          "sortBy": { "type": "string", "enum": [...] },
          ...
        }
      }
    },
    ...
  ],
  "count": 20
}
```

---

## 📚 Available Tools

### Market Discovery & Token Data

#### `get_trending_tokens`
Get trending tokens with powerful filtering and sorting.

**Parameters:**
- `sortBy` (string): volume | trades | marketCap | priceChange
- `timeframe` (string): 1m | 5m | 1h | 6h | 24h
- `minVolumeSol` (number): Minimum volume in SOL
- `maxVolumeSol` (number): Maximum volume in SOL
- `minTrades` (number): Minimum trade count
- `minMarketCapUSD` (number): Minimum market cap
- `maxMarketCapUSD` (number): Maximum market cap
- `onlyLive` (boolean): Only bonding curve tokens
- `onlyComplete` (boolean): Only graduated tokens
- `limit` (number): Max results (1-100)

**Example:**
```json
{
  "tool": "get_trending_tokens",
  "arguments": {
    "sortBy": "priceChange",
    "timeframe": "5m",
    "minVolumeSol": 10,
    "limit": 5
  }
}
```

#### `get_token_details`
Get comprehensive details about a specific token.

**Parameters:**
- `mintAddress` (string, required): Token mint address

#### `get_token_metrics`
Get detailed market metrics for a token.

**Parameters:**
- `poolAddress` (string, required): Bonding curve pool address

#### `search_tokens`
Search tokens by name or symbol.

**Parameters:**
- `query` (string, required): Search query
- `limit` (number): Max results

---

### Trading Operations

#### `buy_token`
Execute a buy order for a token.

**Parameters:**
- `mintAddress` (string, required): Token to buy
- `amountSol` (number, required): Amount of SOL to spend
- `slippageBps` (number): Slippage tolerance (default: 500 = 5%)
- `orderType` (string): "market" | "limit"
- `limitPriceSol` (number): Limit price per token (for limit orders)

**Risk Level:** HIGH

#### `sell_token`
Execute a sell order for a token.

**Parameters:**
- `mintAddress` (string, required): Token to sell
- `amountTokens` (number): Amount of tokens to sell (omit for 100%)
- `percentageToSell` (number): Percentage to sell (0-100)
- `slippageBps` (number): Slippage tolerance
- `orderType` (string): "market" | "limit"
- `limitPriceSol` (number): Limit price per token (for limit orders)

**Risk Level:** HIGH

#### `cancel_order`
Cancel an open order.

**Parameters:**
- `orderId` (string, required): Order ID to cancel

**Risk Level:** MODERATE

---

### Portfolio & Position Management

#### `get_portfolio`
Get current portfolio with positions and P/L.

**Parameters:** None

#### `get_position`
Get detailed position for a specific token.

**Parameters:**
- `mintAddress` (string, required): Token mint address

#### `get_open_orders`
Get all open orders.

**Parameters:** None

---

### Market Activity & Analysis

#### `get_recent_trades`
Get recent on-chain trades for a token.

**Parameters:**
- `mintAddress` (string, required): Token mint address
- `limit` (number): Max results (default: 50)

#### `get_user_trades`
Get AI trader's historical trades.

**Parameters:**
- `mintAddress` (string): Filter by token (optional)
- `limit` (number): Max results (default: 20)

#### `get_top_holders`
Get top holders for a token.

**Parameters:**
- `mintAddress` (string, required): Token mint address
- `limit` (number): Max results

---

### Wallet & Balance

#### `get_wallet_balance`
Get current SOL balance.

**Parameters:** None

#### `get_risk_profile`
Get risk management settings and current usage.

**Parameters:** None

---

## 🔄 Example Workflow

### Python Example: External AI Agent

```python
import requests
import json

class AutoTraderClient:
    def __init__(self, trader_id: str, api_key: str, base_url: str = "http://192.168.50.180:3000"):
        self.trader_id = trader_id
        self.api_key = api_key
        self.base_url = base_url
        self.endpoint = f"{base_url}/api/ai-trader/{trader_id}/tools"
    
    def execute_tool(self, tool: str, arguments: dict = None):
        """Execute a trading tool"""
        response = requests.post(
            self.endpoint,
            headers={
                "X-API-Key": self.api_key,
                "Content-Type": "application/json"
            },
            json={
                "tool": tool,
                "arguments": arguments or {}
            }
        )
        response.raise_for_status()
        return response.json()
    
    def list_tools(self):
        """Get available tools"""
        response = requests.get(
            self.endpoint,
            headers={"X-API-Key": self.api_key}
        )
        response.raise_for_status()
        return response.json()

# Initialize client
client = AutoTraderClient(
    trader_id="cm123...",
    api_key="at_abc123..."
)

# List available tools
tools = client.list_tools()
print(f"Available tools: {tools['count']}")

# Get trending tokens
trending = client.execute_tool("get_trending_tokens", {
    "sortBy": "volume",
    "timeframe": "1h",
    "limit": 5
})
print(f"Top trending: {trending['result']['count']} tokens")

# Get current portfolio
portfolio = client.execute_tool("get_portfolio")
print(f"Portfolio value: ${portfolio['result']['totalValueUSD']}")

# Execute a trade (if AI decides to)
buy_result = client.execute_tool("buy_token", {
    "mintAddress": "5cBr...7ak",
    "amountSol": 1.0,
    "slippageBps": 500,
    "orderType": "limit",
    "limitPriceSol": 0.00000005
})
print(f"Order placed: {buy_result['result']['orderId']}")
```

---

### Node.js Example

```javascript
const axios = require('axios');

class AutoTraderClient {
  constructor(traderId, apiKey, baseUrl = 'http://192.168.50.180:3000') {
    this.traderId = traderId;
    this.apiKey = apiKey;
    this.endpoint = `${baseUrl}/api/ai-trader/${traderId}/tools`;
  }

  async executeTool(tool, args = {}) {
    const response = await axios.post(
      this.endpoint,
      { tool, arguments: args },
      { headers: { 'X-API-Key': this.apiKey } }
    );
    return response.data;
  }

  async listTools() {
    const response = await axios.get(
      this.endpoint,
      { headers: { 'X-API-Key': this.apiKey } }
    );
    return response.data;
  }
}

// Usage
const client = new AutoTraderClient('cm123...', 'at_abc123...');

// Get trending tokens
const trending = await client.executeTool('get_trending_tokens', {
  sortBy: 'priceChange',
  timeframe: '5m',
  limit: 10
});

console.log('Trending tokens:', trending.result.tokens);
```

---

## 🔒 Security Best Practices

### 1. API Key Storage
- **NEVER** commit API keys to version control
- Store in environment variables or secure vaults
- Use different keys for dev/prod environments

### 2. Network Security
- Use HTTPS in production
- Restrict API access by IP if possible
- Implement rate limiting in your client

### 3. Error Handling
```python
try:
    result = client.execute_tool("buy_token", {...})
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 403:
        print("Invalid API key")
    elif e.response.status_code == 500:
        print("Server error:", e.response.json()['message'])
```

---

## 📊 Rate Limits & Quotas

- No hard rate limits currently
- Risk profile enforces daily spend limits
- Cooldown periods between trades
- Maximum concurrent positions

Check risk profile with `get_risk_profile` tool.

---

## 🐛 Troubleshooting

### 401 Unauthorized
- Check API key is correct
- Ensure key is in `X-API-Key` or `Authorization` header

### 403 Forbidden
- API key doesn't match this AI trader
- AI trader may be inactive

### 404 Tool Not Found
- Tool name misspelled
- Use `GET /api/ai-trader/{id}/tools` to list available tools

### 500 Internal Error
- Check `arguments` match tool's parameter schema
- Review error message for details

---

## 🎯 Use Cases

### 1. Multi-Agent Trading System
External coordinator AI distributes analysis tasks to multiple AutoTrader AI agents.

### 2. External Analysis Integration
Use specialized analysis AIs (sentiment, technical, on-chain) to inform AutoTrader agents.

### 3. Cross-Platform Trading
Integrate AutoTrader's pump.fun trading with other DEX strategies.

### 4. Research & Backtesting
Historical data access for strategy development.

---

## 📞 Support

For issues or questions:
1. Check tool execution logs in AI trader dashboard
2. Verify API key and endpoint URL
3. Test with simple tools first (`get_wallet_balance`, `get_portfolio`)
4. Check `AgentEvent` logs in database for execution details

---

**Last Updated:** November 2025

