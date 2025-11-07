import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { AiTraderLayoutClient } from '@/components/ai-trader/AiTraderLayoutClient'

export default async function AiTraderLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const session = await requireAuth()

  if (!session) {
    redirect('/login')
  }

  // Fetch AI trader details
  const aiTrader = await prisma.user.findFirst({
    where: {
      id: params.id,
      isAiAgent: true,
    },
    include: {
      aiConfig: true,
    },
  })

  if (!aiTrader || !aiTrader.aiConfig) {
    redirect('/dashboard/admin/ai-traders')
  }

  const config = aiTrader.aiConfig.configJson as any

  return (
    <AiTraderLayoutClient
      traderId={params.id}
      traderName={aiTrader.aiConfig.configName}
      traderUsername={aiTrader.username}
      themeColor={config?.themeColor || '#00ff88'}
      currentUserUsername={session.user.username}
    >
      {children}
    </AiTraderLayoutClient>
  )
}

