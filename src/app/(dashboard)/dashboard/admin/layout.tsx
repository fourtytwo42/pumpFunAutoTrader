import { requireAdminOrPowerUser } from '@/lib/middleware'

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminOrPowerUser()
  return <>{children}</>
}

