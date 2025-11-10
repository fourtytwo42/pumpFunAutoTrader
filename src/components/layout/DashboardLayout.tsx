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
  Menu as MenuIcon,
  MenuOpen,
  ManageAccounts,
} from '@mui/icons-material'
import { useState, useEffect } from 'react'
import { WalletProvider, useWallet } from '@/components/wallet/WalletProvider'

const EXPANDED_DRAWER_WIDTH = 240
const COLLAPSED_DRAWER_WIDTH = 72
const SIDEBAR_STORAGE_KEY = 'sidebarCollapsed'

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Tokens', icon: <TrendingUp />, path: '/dashboard/tokens' },
  { text: 'Portfolio', icon: <AccountBalanceWallet />, path: '/dashboard/portfolio' },
  { text: 'Faucet', icon: <Science />, path: '/dashboard/faucet' },
  { text: 'User Settings', icon: <ManageAccounts />, path: '/dashboard/settings' },
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
  const [collapsed, setCollapsed] = useState(true)
  const drawerWidth = collapsed ? COLLAPSED_DRAWER_WIDTH : EXPANDED_DRAWER_WIDTH
  const { balanceDisplay, openWallet, solUsdPrice } = useWallet()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved !== null) {
      setCollapsed(saved === 'true')
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'true' : 'false')
  }, [collapsed])

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

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev)
  }

  const drawer = (
    <Box>
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 1 : 2,
        }}
      >
        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{
            opacity: collapsed ? 0 : 1,
            pointerEvents: collapsed ? 'none' : 'auto',
            transition: 'opacity 0.2s ease',
          }}
        >
          Pump.fun Mock
        </Typography>
        <IconButton size="small" onClick={toggleCollapsed} sx={{ color: 'inherit' }}>
          {collapsed ? <MenuIcon /> : <MenuOpen />}
        </IconButton>
      </Toolbar>
      <List>
        {allMenuItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={pathname === item.path}
              onClick={() => router.push(item.path)}
              sx={{
                minHeight: 48,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 1.5 : 2.5,
              }}
            >
              <ListItemIcon
                sx={{
                  color: pathname === item.path ? 'primary.main' : 'inherit',
                  minWidth: collapsed ? 0 : 40,
                  mr: collapsed ? 0 : 2,
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!collapsed && <ListItemText primary={item.text} />}
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
          <IconButton
            color="inherit"
            edge="start"
            onClick={toggleCollapsed}
            sx={{ mr: 2, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {collapsed ? <MenuIcon /> : <MenuOpen />}
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Pump.fun Mock Trader
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              color="inherit"
              variant="outlined"
              onClick={openWallet}
              sx={{ borderColor: 'rgba(255,255,255,0.3)' }}
            >
              {balanceDisplay}
            </Button>
            {solUsdPrice != null ? (
              <Box
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1.5,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: 13,
                }}
              >
                <Typography component="span" sx={{ fontWeight: 500 }}>
                  SOL
                </Typography>
                <Typography component="span" color="text.primary" sx={{ fontWeight: 600 }}>
                  ${solUsdPrice.toFixed(2)}
                </Typography>
              </Box>
            ) : null}
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {session.user.username}
            </Typography>
            <Avatar
              src={session.user.avatarUrl ?? undefined}
              sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}
            >
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

