import nodemailer from 'nodemailer'
import type { SmtpConfig } from '@prisma/client'

export interface SanitizedSmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string | null
  fromEmail: string
  fromName: string | null
  hasPassword: boolean
  lastTestAt: string | null
  lastTestStatus: string | null
  lastTestError: string | null
}

export function sanitizeSmtpConfig(config: SmtpConfig): SanitizedSmtpConfig {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    username: config.username,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    hasPassword: Boolean(config.password),
    lastTestAt: config.lastTestAt ? config.lastTestAt.toISOString() : null,
    lastTestStatus: config.lastTestStatus ?? null,
    lastTestError: config.lastTestError ?? null,
  }
}

export function buildFromAddress(config: SmtpConfig): string {
  if (config.fromName && config.fromName.trim().length > 0) {
    return `"${config.fromName.trim()}" <${config.fromEmail}>`
  }
  return config.fromEmail
}

export async function sendSmtpTestEmail(to: string, config: SmtpConfig): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.username && config.password
        ? {
            user: config.username,
            pass: config.password,
          }
        : undefined,
  })

  await transporter.sendMail({
    from: buildFromAddress(config),
    to,
    subject: 'AutoTrader SMTP Test Email',
    text: `This is a test email sent from your AutoTrader admin panel at ${new Date().toISOString()}.`,
  })
}

