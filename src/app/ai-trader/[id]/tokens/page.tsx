import { redirect } from 'next/navigation'

export default function AiTraderTokensPage({ params }: { params: { id: string } }) {
  // Redirect to main tokens page (same for all users)
  redirect('/dashboard/tokens')
}

