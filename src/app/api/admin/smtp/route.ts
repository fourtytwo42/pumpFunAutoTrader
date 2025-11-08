import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/middleware'
import { sanitizeSmtpConfig } from '@/lib/email/smtp'

export const runtime = 'nodejs'

const SMTP_CONFIG_ID = 'primary'

function validateEmail(value: unknown): value is string {
  return typeof value === 'string' && value.includes('@')
}

export async function GET() {
  await requireAdmin()

  const config = await prisma.smtpConfig.findUnique({
    where: { id: SMTP_CONFIG_ID },
  })

  return NextResponse.json({
    config: config ? sanitizeSmtpConfig(config) : null,
  })
}

export async function PUT(request: NextRequest) {
  await requireAdmin()

  const body = await request.json().catch(() => null)

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const host = typeof body.host === 'string' ? body.host.trim() : ''
  const port = Number(body.port)
  const secure = Boolean(body.secure)
  const username =
    typeof body.username === 'string' && body.username.trim().length > 0
      ? body.username.trim()
      : null
  const fromEmail = typeof body.fromEmail === 'string' ? body.fromEmail.trim() : ''
  const fromName =
    typeof body.fromName === 'string' && body.fromName.trim().length > 0
      ? body.fromName.trim()
      : null

  if (!host) {
    return NextResponse.json({ error: 'SMTP host is required' }, { status: 400 })
  }

  if (!Number.isInteger(port) || port <= 0) {
    return NextResponse.json({ error: 'SMTP port must be a positive integer' }, { status: 400 })
  }

  if (!validateEmail(fromEmail)) {
    return NextResponse.json({ error: 'A valid From email address is required' }, { status: 400 })
  }

  const existing = await prisma.smtpConfig.findUnique({
    where: { id: SMTP_CONFIG_ID },
  })

  const data: {
    host: string
    port: number
    secure: boolean
    username: string | null
    password?: string | null
    fromEmail: string
    fromName: string | null
  } = {
    host,
    port,
    secure,
    username,
    fromEmail,
    fromName,
  }

  if (Object.prototype.hasOwnProperty.call(body, 'password')) {
    const password =
      typeof body.password === 'string' && body.password.length > 0 ? body.password : null
    data.password = password
  }

  const config = await prisma.smtpConfig.upsert({
    where: { id: SMTP_CONFIG_ID },
    create: {
      id: SMTP_CONFIG_ID,
      ...data,
    },
    update: {
      ...data,
      password:
        data.password !== undefined
          ? data.password
          : existing?.password ?? null,
    },
  })

  return NextResponse.json({
    config: sanitizeSmtpConfig(config),
  })
}

