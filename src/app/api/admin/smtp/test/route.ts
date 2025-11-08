import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/middleware'
import { sanitizeSmtpConfig, sendSmtpTestEmail } from '@/lib/email/smtp'

export const runtime = 'nodejs'

const SMTP_CONFIG_ID = 'primary'

function validateEmail(value: unknown): value is string {
  return typeof value === 'string' && value.includes('@')
}

export async function POST(request: NextRequest) {
  await requireAdmin()

  const body = await request.json().catch(() => null)
  const toEmail =
    body && typeof body === 'object' && validateEmail(body.toEmail) ? body.toEmail : null

  const config = await prisma.smtpConfig.findUnique({
    where: { id: SMTP_CONFIG_ID },
  })

  if (!config) {
    return NextResponse.json({ error: 'SMTP settings are not configured yet.' }, { status: 400 })
  }

  if (!config.fromEmail || !validateEmail(config.fromEmail)) {
    return NextResponse.json(
      { error: 'Configured From email address is invalid.' },
      { status: 400 }
    )
  }

  const recipient = toEmail ?? config.fromEmail

  try {
    await sendSmtpTestEmail(recipient, config)

    const updated = await prisma.smtpConfig.update({
      where: { id: SMTP_CONFIG_ID },
      data: {
        lastTestAt: new Date(),
        lastTestStatus: 'success',
        lastTestError: null,
      },
    })

    return NextResponse.json({
      message: `Test email sent to ${recipient}`,
      config: sanitizeSmtpConfig(updated),
    })
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to send test email'

    const updated = await prisma.smtpConfig.update({
      where: { id: SMTP_CONFIG_ID },
      data: {
        lastTestAt: new Date(),
        lastTestStatus: 'failed',
        lastTestError: errorMessage,
      },
    })

    return NextResponse.json(
      {
        error: errorMessage,
        config: sanitizeSmtpConfig(updated),
      },
      { status: 500 }
    )
  }
}

