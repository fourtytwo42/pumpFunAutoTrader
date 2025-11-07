import { Container, Typography, Paper, Button } from '@mui/material'

export default function AiTraderFaucetPage() {
  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Faucet
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Request test SOL for the AI trader. The faucet is shared across all users.
      </Typography>
      
      <Paper sx={{ p: 3, textAlign: 'center', py: 6 }}>
        <Typography variant="h6" color="text.secondary">
          Faucet view coming soon
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          For now, use the main faucet page or manage the AI trader&apos;s balance via the admin panel.
        </Typography>
        <Button
          variant="outlined"
          href="/dashboard/faucet"
          target="_blank"
          sx={{ mt: 2 }}
        >
          Open Faucet in New Tab
        </Button>
      </Paper>
    </Container>
  )
}
