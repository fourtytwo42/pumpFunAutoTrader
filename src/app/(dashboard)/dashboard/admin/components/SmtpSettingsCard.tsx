'use client'

import { useMemo, useState } from 'react'
import {
  Paper,
  Stack,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
  Chip,
  CircularProgress,
} from '@mui/material'

export interface SmtpSettingsCardProps {
  initialConfig: {
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
  } | null
}

interface FormState {
  host: string
  port: string
  secure: boolean
  username: string
  password: string
  fromEmail: string
  fromName: string
}

const DEFAULT_FORM: FormState = {
  host: '',
  port: '587',
  secure: false,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Never'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return 'Never'
  }
  return date.toLocaleString()
}

export function SmtpSettingsCard({ initialConfig }: SmtpSettingsCardProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialConfig
      ? {
          host: initialConfig.host,
          port: String(initialConfig.port),
          secure: initialConfig.secure,
          username: initialConfig.username ?? '',
          password: '',
          fromEmail: initialConfig.fromEmail,
          fromName: initialConfig.fromName ?? '',
        }
      : DEFAULT_FORM
  )
  const [hasExistingPassword, setHasExistingPassword] = useState<boolean>(
    Boolean(initialConfig?.hasPassword)
  )
  const [passwordChanged, setPasswordChanged] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testRecipient, setTestRecipient] = useState<string>(
    initialConfig?.fromEmail ?? ''
  )
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [meta, setMeta] = useState<{
    lastTestAt: string | null
    lastTestStatus: string | null
    lastTestError: string | null
  }>({
    lastTestAt: initialConfig?.lastTestAt ?? null,
    lastTestStatus: initialConfig?.lastTestStatus ?? null,
    lastTestError: initialConfig?.lastTestError ?? null,
  })

  const testStatusChip = useMemo(() => {
    if (!meta.lastTestStatus) {
      return <Chip size="small" label="Not Tested" color="default" />
    }
    if (meta.lastTestStatus === 'success') {
      return <Chip size="small" label="Last Test: Success" color="success" />
    }
    return <Chip size="small" label="Last Test: Failed" color="error" />
  }, [meta.lastTestStatus])

  const handleChange = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({
      ...prev,
      [key]: event.target.value,
    }))
    if (key === 'password') {
      setPasswordChanged(true)
    }
  }

  const handleToggleSecure = (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      secure: checked,
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const payload: Record<string, unknown> = {
        host: form.host.trim(),
        port: Number(form.port),
        secure: form.secure,
        username: form.username.trim() || null,
        fromEmail: form.fromEmail.trim(),
        fromName: form.fromName.trim() || null,
      }

      if (passwordChanged) {
        payload.password = form.password
      }

      const response = await fetch('/api/admin/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save SMTP settings')
      }

      const updated = data.config
      setForm((prev) => ({
        ...prev,
        host: updated.host,
        port: String(updated.port),
        secure: updated.secure,
        username: updated.username ?? '',
        password: '',
        fromEmail: updated.fromEmail,
        fromName: updated.fromName ?? '',
      }))
      setHasExistingPassword(updated.hasPassword)
      setPasswordChanged(false)
      setMeta({
        lastTestAt: updated.lastTestAt,
        lastTestStatus: updated.lastTestStatus,
        lastTestError: updated.lastTestError,
      })
      if (!testRecipient) {
        setTestRecipient(updated.fromEmail)
      }
      setMessage({ type: 'success', text: 'SMTP settings saved successfully.' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error?.message || 'Failed to save SMTP settings.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestMessage(null)

    try {
      const response = await fetch('/api/admin/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: testRecipient.trim() || undefined }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to send test email')
      }

      const updated = data.config
      setMeta({
        lastTestAt: updated.lastTestAt,
        lastTestStatus: updated.lastTestStatus,
        lastTestError: updated.lastTestError,
      })
      setTestMessage({ type: 'success', text: data?.message || 'Test email sent successfully.' })
    } catch (error: any) {
      setMeta((prev) => ({
        ...prev,
        lastTestStatus: 'failed',
        lastTestError: error?.message || 'Failed to send test email.',
      }))
      setTestMessage({
        type: 'error',
        text: error?.message || 'Failed to send test email.',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <div>
            <Typography variant="h6">SMTP Email Settings</Typography>
            <Typography variant="body2" color="text.secondary">
              Configure email delivery for notifications, 2FA, and signup confirmations.
            </Typography>
          </div>
          {testStatusChip}
        </Stack>

        {message && <Alert severity={message.type}>{message.text}</Alert>}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="SMTP Host"
            value={form.host}
            onChange={handleChange('host')}
            fullWidth
            required
          />
          <TextField
            label="Port"
            value={form.port}
            onChange={handleChange('port')}
            fullWidth
            required
            type="number"
          />
        </Stack>

        <FormControlLabel
          control={<Switch checked={form.secure} onChange={handleToggleSecure} />}
          label="Use secure connection (TLS/SSL)"
        />

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Username"
            value={form.username}
            onChange={handleChange('username')}
            fullWidth
            placeholder="Optional"
          />
          <TextField
            label="Password"
            value={form.password}
            onChange={handleChange('password')}
            type="password"
            fullWidth
            placeholder={hasExistingPassword && !passwordChanged ? '••••••••••' : ''}
            helperText={
              hasExistingPassword && !passwordChanged
                ? 'Leave blank to keep the existing password.'
                : 'Enter the SMTP password.'
            }
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="From Email"
            value={form.fromEmail}
            onChange={handleChange('fromEmail')}
            fullWidth
            required
          />
          <TextField
            label="From Name"
            value={form.fromName}
            onChange={handleChange('fromName')}
            fullWidth
            placeholder="Optional display name"
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ minWidth: 160 }}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : 'Save Settings'}
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Last tested: {formatTimestamp(meta.lastTestAt)}
            {meta.lastTestStatus === 'failed' && meta.lastTestError
              ? ` · ${meta.lastTestError}`
              : null}
          </Typography>
        </Stack>

        <Divider />

        <Typography variant="subtitle1">Send Test Email</Typography>
        {testMessage && <Alert severity={testMessage.type}>{testMessage.text}</Alert>}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Test Recipient"
            value={testRecipient}
            onChange={(event) => setTestRecipient(event.target.value)}
            fullWidth
            placeholder="Email address to send a test message"
          />
          <Button variant="outlined" onClick={handleTest} disabled={testing} sx={{ minWidth: 160 }}>
            {testing ? <CircularProgress size={20} /> : 'Send Test Email'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}

