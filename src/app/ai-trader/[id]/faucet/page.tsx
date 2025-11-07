import { redirect } from 'next/navigation'

export default function AiTraderFaucetPage({ params }: { params: { id: string } }) {
  // Redirect to main faucet page
  redirect('/dashboard/faucet')
}

