'use client'

import { useRouter, usePathname } from 'next/navigation'
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Chip,
  CircularProgress,
} from '@mui/material'
import {
  Dashboard,
  TrendingUp,
  AccountBalanceWallet,
  WaterDrop,
  Chat,
  ArrowBack,
  SmartToy,
} from '@mui/icons-material'
import { useState, useEffect } from 'react'
import { AiTraderThemeProvider } from './AiTraderThemeProvider'

const drawerWidth = 240

export function AiTraderLayoutClient({
  children,
  traderId,
  traderName,
  traderUsername,
  themeColor,
  currentUserUsername,
}: {
  children: React.ReactNode
  traderId: string
  traderName: string
  traderUsername: string
  themeColor: string
  currentUserUsername: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(true)

  useEffect(() => {
    // Fetch AI trader's wallet balance
    fetch(`/api/portfolio?userId=${traderId}`)
      .then((res) => res.json())
      .then((data) => {
        setWalletBalance(data.balanceSol || 0)
        setLoadingBalance(false)
      })
      .catch((error) => {
        console.error('Failed to load wallet balance:', error)
        setLoadingBalance(false)
      })
  }, [traderId])

  const menuItems = [
    { text: 'Dashboard', icon: <Dashboard />, path: `/ai-trader/${traderId}/dashboard` },
    { text: 'Tokens', icon: <TrendingUp />, path: `/ai-trader/${traderId}/tokens` },
    { text: 'Portfolio', icon: <AccountBalanceWallet />, path: `/ai-trader/${traderId}/portfolio` },
    { text: 'Faucet', icon: <WaterDrop />, path: `/ai-trader/${traderId}/faucet` },
    { text: 'Chat & Control', icon: <Chat />, path: `/ai-trader/${traderId}/chat` },
  ]

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const drawer = (
    <Box>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: themeColor,
              boxShadow: `0 0 10px ${themeColor}`,
            }}
          />
          <Typography variant="h6" noWrap>
            {traderName}
          </Typography>
        </Box>
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton selected={pathname === item.path} onClick={() => router.push(item.path)}>
              <ListItemIcon
                sx={{ color: pathname === item.path ? themeColor : 'inherit' }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )

  return (
    <AiTraderThemeProvider themeColor={themeColor}>
      <Box sx={{ display: 'flex' }}>
        <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            backgroundColor: '#0a0a0a',
            borderBottom: `2px solid ${themeColor}`,
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { sm: 'none' } }}
            >
              <SmartToy />
            </IconButton>
            <SmartToy sx={{ mr: 1, color: themeColor }} />
            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
              {traderName}{' '}
              <Typography component="span" variant="body2" color="text.secondary">
                @{traderUsername}
              </Typography>
            </Typography>
            {loadingBalance ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                <CircularProgress size={16} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : (
              <Button
                color="inherit"
                variant="outlined"
                size="small"
                sx={{
                  borderColor: themeColor,
                  color: themeColor,
                  mr: 2,
                  '&:hover': {
                    borderColor: themeColor,
                    backgroundColor: `${themeColor}20`,
                  },
                }}
              >
                {walletBalance !== null ? `${walletBalance.toFixed(2)} SOL` : '0 SOL'}
              </Button>
            )}
            <Chip
              label="AI Trader"
              size="small"
              sx={{
                mr: 2,
                backgroundColor: `${themeColor}20`,
                color: themeColor,
                borderColor: themeColor,
                border: '1px solid',
              }}
            />
            <Typography variant="body2" sx={{ mr: 2 }}>
              {currentUserUsername}
            </Typography>
            <Button
              color="inherit"
              startIcon={<ArrowBack />}
              onClick={() => router.push('/dashboard/dashboard')}
              sx={{
                borderColor: themeColor,
                color: themeColor,
                border: '1px solid',
                '&:hover': {
                  borderColor: themeColor,
                  backgroundColor: `${themeColor}20`,
                },
              }}
            >
              My Dashboard
            </Button>
          </Toolbar>
        </AppBar>

        <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: 'block', sm: 'none' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
            }}
          >
            {drawer}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
                borderRight: `1px solid ${themeColor}40`,
              },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            mt: 8,
          }}
        >
          {children}
        </Box>
      </Box>
    </AiTraderThemeProvider>
  )
}

