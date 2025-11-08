import type { PrismaClient, Prisma } from '@prisma/client'
import { getMetadataForMint, TokenMetadata } from './metadata-fetcher'
import { normaliseMetadataUri } from './unified-trade'

export type TokenWithBasicMetadata = {
  id: string
  mintAddress: string
  name: string
  symbol: string
  imageUri: string | null
  twitter: string | null
  telegram: string | null
  website: string | null
}

export function coalesceString(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0 && trimmed !== 'N/A') {
        return trimmed
      }
    }
  }
  return undefined
}

export function deriveSymbolFromName(name?: string | null): string | undefined {
  if (!name) return undefined
  const cleaned = name.replace(/[^A-Za-z0-9]/g, '')
  if (!cleaned) return undefined
  return cleaned.slice(0, 10).toUpperCase()
}

function looksLikeMintPrefix(value: string | null | undefined, mint: string): boolean {
  if (!value) return true
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (!cleaned) return true
  if (cleaned.length < 4) return false
  const mintUpper = mint.toUpperCase()
  return mintUpper.startsWith(cleaned)
}

function shouldRefreshMetadata(token: TokenWithBasicMetadata): boolean {
  if (!token.name || !token.symbol) return true
  if (looksLikeMintPrefix(token.name, token.mintAddress)) return true
  if (looksLikeMintPrefix(token.symbol, token.mintAddress)) return true
  if (token.name === token.symbol && token.name.length <= 10) return true
  if (token.name.toUpperCase() === token.name && token.name.length <= 6) return true
  if (!token.imageUri) return true
  return false
}

function buildMetadataUpdate(
  token: TokenWithBasicMetadata,
  metadata: TokenMetadata | null
): {
  name: string
  symbol: string
  imageUri: string | null
  twitter: string | null
  telegram: string | null
  website: string | null
} | null {
  if (!metadata) {
    return null
  }

  const nextName =
    coalesceString(metadata.name, token.name, token.mintAddress) ?? token.name ?? token.mintAddress
  const nextSymbol =
    coalesceString(metadata.symbol, deriveSymbolFromName(metadata.name), token.symbol) ??
    token.symbol ??
    token.mintAddress.slice(0, 6).toUpperCase()

  const nextImage = normaliseMetadataUri(coalesceString(metadata.image))
  const nextTwitter = coalesceString(metadata.twitter)
  const nextTelegram = coalesceString(metadata.telegram)
  const nextWebsite = coalesceString(metadata.website)

  const hasChanges =
    nextName !== token.name ||
    nextSymbol !== token.symbol ||
    (nextImage ?? null) !== token.imageUri ||
    (nextTwitter ?? null) !== token.twitter ||
    (nextTelegram ?? null) !== token.telegram ||
    (nextWebsite ?? null) !== token.website

  if (!hasChanges) {
    return null
  }

  return {
    name: nextName,
    symbol: nextSymbol,
    imageUri: nextImage ?? null,
    twitter: nextTwitter ?? null,
    telegram: nextTelegram ?? null,
    website: nextWebsite ?? null,
  }
}

export async function ensureTokensMetadata<T extends TokenWithBasicMetadata>(
  prisma: PrismaClient,
  tokens: T[],
  options: { logUpdates?: boolean } = {}
): Promise<void> {
  const { logUpdates = false } = options

  for (const token of tokens) {
    if (!shouldRefreshMetadata(token)) {
      continue
    }

    try {
      const { metadata } = await getMetadataForMint(token.mintAddress)
      const update = buildMetadataUpdate(token, metadata)
      if (!update) continue

      const updateData: Prisma.TokenUpdateInput = {}

      if (update.name !== token.name) {
        updateData.name = update.name
        token.name = update.name
      }
      if (update.symbol !== token.symbol) {
        updateData.symbol = update.symbol
        token.symbol = update.symbol
      }
      if ((update.imageUri ?? null) !== token.imageUri) {
        updateData.imageUri = update.imageUri
        token.imageUri = update.imageUri
      }
      if ((update.twitter ?? null) !== token.twitter) {
        updateData.twitter = update.twitter
        token.twitter = update.twitter
      }
      if ((update.telegram ?? null) !== token.telegram) {
        updateData.telegram = update.telegram
        token.telegram = update.telegram
      }
      if ((update.website ?? null) !== token.website) {
        updateData.website = update.website
        token.website = update.website
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.token.update({
          where: { id: token.id },
          data: updateData,
        })
        if (logUpdates) {
          console.log(`[metadata] Updated ${token.mintAddress}`)
        }
      }
    } catch (error) {
      console.warn(
        `[metadata] Failed to refresh metadata for ${token.mintAddress}:`,
        (error as Error).message
      )
    }
  }
}


