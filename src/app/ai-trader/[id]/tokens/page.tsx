import { Container, Typography, Alert } from '@mui/material'

export default function AiTraderTokensPage() {
  return (
    <Container maxWidth="lg">
      <Typography variant="h4" component="h1" gutterBottom>
        Token Browser
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        This shows the same token list for all users. The AI trader can view and analyze any pump.fun token.
      </Alert>
      <iframe
        src="/dashboard/tokens"
        style={{
          width: '100%',
          height: 'calc(100vh - 200px)',
          border: 'none',
          borderRadius: '8px',
        }}
        title="Tokens"
      />
    </Container>
  )
}
