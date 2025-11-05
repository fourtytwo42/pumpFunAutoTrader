# Pump.fun Mock Trader MCP Server

MCP server for AI traders to interact with the pump.fun mock trading platform.

## Setup

1. Install dependencies:
```bash
cd mcp-server
npm install
```

2. Build:
```bash
npm run build
```

3. Configure environment variables:
```bash
DATABASE_URL="postgresql://autotrader:autotrader_password@localhost:5432/autotrader?schema=public"
MCP_API_KEY="your-api-key-here"  # Optional, for client authentication
```

## Usage

The MCP server communicates via stdio. Configure it in your MCP client:

```json
{
  "mcpServers": {
    "pump-fun-trader": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

## Available Tools

See `src/index.ts` for complete list of tools. All trading tools require authentication via API key.

