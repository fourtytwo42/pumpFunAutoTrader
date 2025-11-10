import 'next-auth'
import { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username: string
      email: string | null
      avatarUrl: string | null
      role: UserRole
      isAiAgent: boolean
    }
  }

  interface User {
    id: string
    username: string
    email?: string | null
    avatarUrl?: string | null
    role: UserRole
    isAiAgent: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    username: string
    email: string | null
    avatarUrl: string | null
    role: UserRole
    isAiAgent: boolean
  }
}

