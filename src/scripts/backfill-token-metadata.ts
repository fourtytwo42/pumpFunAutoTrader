import { PrismaClient } from '@prisma/client'
import { getMetadataForMint, TokenMetadata } from '@/lib/pump/metadata-fetcher'
import { normaliseMetadataUri } from '@/lib/pump/unified-trade'

const prisma = new PrismaClient()

function coalesceString(...values: (string | null | undefined)[]): string | undefined {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function deriveSymbolFromName(name?: string | null): string | undefined {
  if (!name) return undefined
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase()
}

function selectSymbol(tokenSymbol: string, metadata?: TokenMetadata | null, mint?: string): string {
  const metadataSymbol = coalesceString(metadata?.symbol)?.toUpperCase()
  const nameDerivedSymbol = deriveSymbolFromName(metadata?.name)
  const mintFallback = mint ? mint.slice(0, 6).toUpperCase() : 'TOKEN'

  const fallbackSymbol = tokenSymbol ? tokenSymbol.toUpperCase() : ''

  return metadataSymbol ?? nameDerivedSymbol ?? (fallbackSymbol || mintFallback)
}

function selectName(currentName: string, metadata?: TokenMetadata | null, mint?: string): string {
  return coalesceString(metadata?.name, currentName, mint) ?? 'Unknown Token'
}

async function updateTokenMetadata() {
  const tokens = await prisma.token.findMany({
    select: {
      id: true,
      mintAddress: true,
      name: true,
      symbol: true,
      imageUri: true,
      twitter: true,
      telegram: true,
      website: true,
    },
  })

  let updatedCount = 0

  for (const token of tokens) {
    try {
      const { metadata, uri } = await getMetadataForMint(token.mintAddress)
      if (!metadata) {
        continue
      }

      const nextName = selectName(token.name, metadata, token.mintAddress)
      const nextSymbol = selectSymbol(token.symbol, metadata, token.mintAddress)
      const nextImage = normaliseMetadataUri(coalesceString(metadata.image))
      const nextTwitter = coalesceString(metadata.twitter)
      const nextTelegram = coalesceString(metadata.telegram)
      const nextWebsite = coalesceString(metadata.website)

      const shouldUpdate =
        nextName !== token.name ||
        nextSymbol !== token.symbol ||
        nextImage !== token.imageUri ||
        nextTwitter !== token.twitter ||
        nextTelegram !== token.telegram ||
        nextWebsite !== token.website

      if (!shouldUpdate) {
        continue
      }

      await prisma.token.update({
        where: { id: token.id },
        data: {
          name: nextName,
          symbol: nextSymbol,
          imageUri: nextImage ?? null,
          twitter: nextTwitter ?? null,
          telegram: nextTelegram ?? null,
          website: nextWebsite ?? null,
        },
      })

      updatedCount += 1
      const uriLog = uri ? ` (${uri})` : ''
      console.log(`[backfill-metadata] Updated ${token.mintAddress}${uriLog}`)
    } catch (error) {
      console.warn(
        `[backfill-metadata] Failed to update metadata for ${token.mintAddress}:`,
        (error as Error).message
      )
    }
  }

  console.log(`[backfill-metadata] Completed. Updated ${updatedCount} token(s).`)
}

updateTokenMetadata()
  .catch((error) => {
    console.error('[backfill-metadata] Fatal error:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


