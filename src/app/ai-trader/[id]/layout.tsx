import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { AiTraderThemeProvider } from '@/components/ai-trader/AiTraderThemeProvider'
import { AiTraderHeader } from '@/components/ai-trader/AiTraderHeader'
import { AiTraderNav } from '@/components/ai-trader/AiTraderNav'

export default async function AiTraderLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const session = await requireAuth()

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
  const themeColor = config?.themeColor || '#00ff88'

  return (
    <AiTraderThemeProvider themeColor={themeColor}>
      <AiTraderHeader
        traderName={aiTrader.aiConfig.configName}
        traderUsername={aiTrader.username}
        traderId={params.id}
        themeColor={themeColor}
      />
      <AiTraderNav traderId={params.id} />
      {children}
    </AiTraderThemeProvider>
  )
}

