import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { fetchAvailableModels, LLMProvider } from '@/lib/llm-providers'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminOrPowerUser()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const provider = searchParams.get('provider') as LLMProvider

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    const baseUrl = searchParams.get('baseUrl') || undefined
    const apiKey = searchParams.get('apiKey') || undefined

    const models = await fetchAvailableModels(provider, { baseUrl, apiKey })

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Fetch LLM models error:', error)
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }
}

