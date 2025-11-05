import { requireAdminOrPowerUser } from '@/lib/middleware'
import { Container, Typography, Box, Paper, Grid, Button } from '@mui/material'
import { useRouter } from 'next/navigation'
import { AdminPanelSettings, People, SmartToy } from '@mui/icons-material'

export default async function AdminPage() {
  const session = await requireAdminOrPowerUser()
  const isAdmin = session.user.role === 'admin'

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Admin Panel
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome, {session.user.username} ({session.user.role})
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              p: 3,
              cursor: 'pointer',
              '&:hover': { boxShadow: 4 },
            }}
            onClick={() => (window.location.href = '/dashboard/admin/users')}
          >
            <People sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              User Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create, edit, and manage user accounts
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper
            sx={{
              p: 3,
              cursor: 'pointer',
              '&:hover': { boxShadow: 4 },
            }}
            onClick={() => (window.location.href = '/dashboard/admin/ai-traders')}
          >
            <SmartToy sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              AI Traders
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Spawn and monitor AI trading agents
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  )
}

