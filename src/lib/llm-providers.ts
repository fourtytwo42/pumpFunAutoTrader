/**
 * LLM Provider Management
 * Supports: OpenAI, Anthropic, Groq, MLStudio, Ollama
 */

export type LLMProvider = 'openai' | 'anthropic' | 'groq' | 'mlstudio' | 'ollama'

export interface LLMConfig {
  provider: LLMProvider
  model: string
  apiKey?: string
  baseUrl?: string // For Ollama and MLStudio
  temperature?: number
  maxTokens?: number
  tools?: any[] // Function definitions for tool calling
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  toolCalls?: {
    name: string
    arguments: any
  }[]
}

/**
 * Fetch available models from each provider
 */
export async function fetchAvailableModels(
  provider: LLMProvider,
  config: Partial<LLMConfig>
): Promise<string[]> {
  try {
    switch (provider) {
      case 'openai':
        return await fetchOpenAIModels(config.apiKey)
      case 'anthropic':
        return await fetchAnthropicModels()
      case 'groq':
        return await fetchGroqModels(config.apiKey)
      case 'mlstudio':
        return await fetchMLStudioModels(config.baseUrl)
      case 'ollama':
        return await fetchOllamaModels(config.baseUrl)
      default:
        return []
    }
  } catch (error) {
    console.error(`Error fetching models for ${provider}:`, error)
    return []
  }
}

async function fetchOpenAIModels(apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    apiKey = process.env.OPENAI_API_KEY
  }
  if (!apiKey) return []

  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) return []

  const data = await response.json()
  return (data.data || [])
    .filter((m: any) => m.id.includes('gpt'))
    .map((m: any) => m.id)
    .sort()
}

async function fetchAnthropicModels(): Promise<string[]> {
  // Anthropic doesn't have a models endpoint, return known models
  return [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ]
}

async function fetchGroqModels(apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    apiKey = process.env.GROQ_API_KEY
  }
  if (!apiKey) return []

  const response = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) return []

  const data = await response.json()
  return (data.data || []).map((m: any) => m.id).sort()
}

async function fetchMLStudioModels(baseUrl?: string): Promise<string[]> {
  if (!baseUrl) {
    baseUrl = process.env.MLSTUDIO_BASE_URL || 'http://localhost:1234'
  }

  // Ensure we don't double up on /v1
  const cleanBaseUrl = baseUrl.replace(/\/v1\/?$/, '')

  try {
    const response = await fetch(`${cleanBaseUrl}/v1/models`)
    if (!response.ok) return []

    const data = await response.json()
    return (data.data || []).map((m: any) => m.id).sort()
  } catch (error) {
    console.error('Error fetching LM Studio models:', error)
    return []
  }
}

async function fetchOllamaModels(baseUrl?: string): Promise<string[]> {
  if (!baseUrl) {
    baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  }

  try {
    const response = await fetch(`${baseUrl}/api/tags`)
    if (!response.ok) return []

    const data = await response.json()
    return (data.models || []).map((m: any) => m.name).sort()
  } catch {
    return []
  }
}

/**
 * Send a chat completion request to the configured LLM
 */
export async function sendLLMRequest(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  switch (config.provider) {
    case 'openai':
      return await sendOpenAIRequest(config, messages)
    case 'anthropic':
      return await sendAnthropicRequest(config, messages)
    case 'groq':
      return await sendGroqRequest(config, messages)
    case 'mlstudio':
      return await sendMLStudioRequest(config, messages)
    case 'ollama':
      return await sendOllamaRequest(config, messages)
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}

async function sendOpenAIRequest(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const body: any = {
    model: config.model,
    messages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 1000,
  }

  if (config.tools && config.tools.length > 0) {
    body.tools = config.tools
    body.tool_choice = 'auto'
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data = await response.json()
  const choice = data.choices[0]
  
  return {
    content: choice?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
      name: tc.function?.name,
      arguments: JSON.parse(tc.function?.arguments || '{}'),
    })),
  }
}

async function sendAnthropicRequest(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured')

  // Convert messages to Anthropic format
  const systemMessage = messages.find((m) => m.role === 'system')
  const conversationMessages = messages.filter((m) => m.role !== 'system')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens ?? 1000,
      temperature: config.temperature ?? 0.7,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${error}`)
  }

  const data = await response.json()
  return {
    content: data.content[0]?.text || '',
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  }
}

async function sendGroqRequest(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const apiKey = config.apiKey || process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('Groq API key not configured')

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Groq API error: ${error}`)
  }

  const data = await response.json()
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  }
}

async function sendMLStudioRequest(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || process.env.MLSTUDIO_BASE_URL || 'http://localhost:1234'
  const cleanBaseUrl = baseUrl.replace(/\/v1\/?$/, '')

  const response = await fetch(`${cleanBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
      stream: false,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`MLStudio API error: ${error}`)
  }

  const data = await response.json()
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  }
}

/**
 * Stream a chat completion request (for real-time UI updates)
 * Returns an async generator that yields chunks
 */
export async function* streamLLMRequest(
  config: LLMConfig,
  messages: LLMMessage[]
): AsyncGenerator<{ type: 'content' | 'done'; content?: string; usage?: any }> {
  const baseUrl = config.baseUrl || process.env.MLSTUDIO_BASE_URL || 'http://localhost:1234'
  const cleanBaseUrl = baseUrl.replace(/\/v1\/?$/, '')

  const response = await fetch(`${cleanBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 1000,
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`MLStudio streaming error: ${error}`)
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  
  if (!reader) {
    throw new Error('No response body')
  }

  let buffer = ''
  let fullContent = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim() || line.trim() === 'data: [DONE]') continue
        if (!line.startsWith('data: ')) continue

        try {
          const json = JSON.parse(line.slice(6))
          const delta = json.choices?.[0]?.delta?.content
          
          if (delta) {
            fullContent += delta
            yield { type: 'content', content: delta }
          }

          // Check if done
          if (json.choices?.[0]?.finish_reason) {
            yield {
              type: 'done',
              content: fullContent,
              usage: {
                promptTokens: json.usage?.prompt_tokens || 0,
                completionTokens: json.usage?.completion_tokens || 0,
                totalTokens: json.usage?.total_tokens || 0,
              },
            }
          }
        } catch (e) {
          console.warn('Failed to parse SSE line:', line)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function sendOllamaRequest(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      options: {
        temperature: config.temperature ?? 0.7,
        num_predict: config.maxTokens ?? 1000,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Ollama API error: ${error}`)
  }

  const data = await response.json()
  return {
    content: data.message?.content || '',
    usage: {
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    },
  }
}

