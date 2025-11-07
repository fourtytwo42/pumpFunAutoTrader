'use client'

import { Box, Button } from '@mui/material'
import { usePathname, useRouter } from 'next/navigation'
import { Dashboard, Token, AccountBalance, WaterDrop, Chat } from '@mui/icons-material'

export function AiTraderNav({ traderId }: { traderId: string }) {
  const router = useRouter()
  const pathname = usePathname()

  const navItems = [
    { label: 'Dashboard', path: `/ai-trader/${traderId}/dashboard`, icon: <Dashboard /> },
    { label: 'Tokens', path: `/ai-trader/${traderId}/tokens`, icon: <Token /> },
    { label: 'Portfolio', path: `/ai-trader/${traderId}/portfolio`, icon: <AccountBalance /> },
    { label: 'Faucet', path: `/ai-trader/${traderId}/faucet`, icon: <WaterDrop /> },
    { label: 'Chat & Control', path: `/ai-trader/${traderId}/chat`, icon: <Chat /> },
  ]

  return (
    <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap', px: 2 }}>
      {navItems.map((item) => (
        <Button
          key={item.path}
          variant={pathname === item.path ? 'contained' : 'outlined'}
          startIcon={item.icon}
          onClick={() => router.push(item.path)}
          size="small"
        >
          {item.label}
        </Button>
      ))}
    </Box>
  )
}

