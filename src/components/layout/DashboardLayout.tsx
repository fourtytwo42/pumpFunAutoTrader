'use client'

import { useSession, signOut } from 'next-auth/react'
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
  Avatar,
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  TrendingUp,
  AccountBalanceWallet,
  Science,
  AdminPanelSettings,
  Logout,
  Settings,
} from '@mui/icons-material'
import { useState } from 'react'
import { WalletProvider, useWallet } from '@/components/wallet/WalletProvider'

const drawerWidth = 240

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Tokens', icon: <TrendingUp />, path: '/dashboard/tokens' },
  { text: 'Portfolio', icon: <AccountBalanceWallet />, path: '/dashboard/portfolio' },
  { text: 'Wallet Setup', icon: <Settings />, path: '/dashboard/wallet' },
  { text: 'Faucet', icon: <Science />, path: '/dashboard/faucet' },
]

const adminItems = [
  { text: 'Admin Panel', icon: <AdminPanelSettings />, path: '/dashboard/admin' },
  { text: 'AI Traders', icon: <Settings />, path: '/dashboard/admin/ai-traders' },
]

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { balanceDisplay, openWallet } = useWallet()

  if (status === 'loading') {
    return <Box>Loading...</Box>
  }

  if (!session) {
    router.push('/login')
    return null
  }

  const isAdmin = session.user.role === 'admin' || session.user.role === 'power_user'
  const allMenuItems = [...menuItems, ...(isAdmin ? adminItems : [])]

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Pump.fun Mock
        </Typography>
      </Toolbar>
      <List>
        {allMenuItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={pathname === item.path}
              onClick={() => router.push(item.path)}
            >
              <ListItemIcon sx={{ color: pathname === item.path ? 'primary.main' : 'inherit' }}>
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
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <DashboardIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Pump.fun Mock Trader
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button color="inherit" variant="outlined" onClick={openWallet} sx={{ borderColor: 'rgba(255,255,255,0.3)' }}>
              {balanceDisplay}
            </Button>
            <Typography variant="body2">{session.user.username}</Typography>
            <Avatar sx={{ width: 32, height: 32 }}>
              {session.user.username.charAt(0).toUpperCase()}
            </Avatar>
            <Button color="inherit" onClick={handleLogout} startIcon={<Logout />}>
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
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
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
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
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <DashboardShell>{children}</DashboardShell>
    </WalletProvider>
  )
}

