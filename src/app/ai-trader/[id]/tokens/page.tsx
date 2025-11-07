import { redirect } from 'next/navigation'

export default function AiTraderTokensPage() {
  // Redirect to shared tokens page
  // The AI trader layout will be removed when navigating away
  // This is intentional as token browsing is the same for all users
  redirect('/dashboard/tokens')
}
