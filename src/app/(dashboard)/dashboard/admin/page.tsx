import { requireAdminOrPowerUser } from '@/lib/middleware'
import Link from 'next/link'
import { Container, Typography, Box, Paper, Grid } from '@mui/material'
import { People, SmartToy } from '@mui/icons-material'

export default async function AdminPage() {
  const session = await requireAdminOrPowerUser()
  if (!session) {
    return null
  }

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
        {isAdmin && (
          <Grid item xs={12} md={6}>
            <Paper
              component={Link}
              href="/dashboard/admin/users"
              sx={{
                p: 3,
                cursor: 'pointer',
                textDecoration: 'none',
                color: 'inherit',
                display: 'block',
                '&:hover': { boxShadow: 4 },
              }}
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
        )}

        <Grid item xs={12} md={6}>
          <Paper
            component={Link}
            href="/dashboard/admin/ai-traders"
            sx={{
              p: 3,
              cursor: 'pointer',
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
              '&:hover': { boxShadow: 4 },
            }}
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

