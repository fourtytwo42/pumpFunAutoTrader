import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/middleware'
import { getOrCreateUserWallet } from '@/lib/wallets'

export default async function WalletPage() {
  const session = await requireAuth()

  if (!session) {
    redirect('/login')
  }

  await getOrCreateUserWallet(session.user.id)

  redirect('/dashboard')
}

