import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from './auth'

interface RequireAuthOptions {
  redirectOnFail?: boolean
}

export async function requireAuth(options: RequireAuthOptions = {}) {
  const session = await getServerSession(authOptions)
  if (!session) {
    if (options.redirectOnFail === false) {
      return null
    }
    redirect('/login')
  }
  return session
}

export async function requireRole(allowedRoles: string[]) {
  const session = await requireAuth()
  if (!session) {
    throw new Error('Invariant: requireAuth returned null when redirectOnFail not disabled')
  }
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

