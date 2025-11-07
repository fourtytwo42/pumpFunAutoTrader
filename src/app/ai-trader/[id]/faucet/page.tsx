import { Container, Typography, Alert } from '@mui/material'

export default function AiTraderFaucetPage() {
  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Faucet
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        The faucet is shared across all users. You can request SOL for testing.
      </Alert>
      <iframe
        src="/dashboard/faucet"
        style={{
          width: '100%',
          height: 'calc(100vh - 200px)',
          border: 'none',
          borderRadius: '8px',
        }}
        title="Faucet"
      />
    </Container>
  )
}
