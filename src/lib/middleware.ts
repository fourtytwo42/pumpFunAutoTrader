import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import { redirect } from 'next/navigation'

export async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }
  return session
}

export async function requireRole(allowedRoles: string[]) {
  const session = await requireAuth()
  if (!allowedRoles.includes(session.user.role)) {
    redirect('/dashboard')
  }
  return session
}

export async function requireAdmin() {
  return requireRole(['admin'])
}

export async function requireAdminOrPowerUser() {
  return requireRole(['admin', 'power_user'])
}

