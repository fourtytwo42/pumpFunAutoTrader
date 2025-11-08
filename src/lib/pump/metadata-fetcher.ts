import { Connection, PublicKey } from '@solana/web3.js'
import { Metadata, PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata'
import { normaliseMetadataUri } from './unified-trade'

export interface TokenMetadata {
  name?: string
  symbol?: string
  image?: string
  description?: string
  twitter?: string
  telegram?: string
  website?: string
  [key: string]: unknown
}

const METADATA_MAX_ATTEMPTS = 5
const METADATA_BASE_DELAY_MS = 500

const metadataJsonPromises = new Map<string, Promise<TokenMetadata | null>>()
const metadataUriByMint = new Map<string, string | null>()
const metadataByMint = new Map<string, Promise<TokenMetadata | null>>()

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const solanaConnection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
})

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function fetchMetadataJson(uri: string): Promise<TokenMetadata | null> {
  const cached = metadataJsonPromises.get(uri)
  if (cached) {
    return cached
  }

  const task = (async () => {
    for (let attempt = 0; attempt < METADATA_MAX_ATTEMPTS; attempt += 1) {
      const attemptNumber = attempt + 1
      try {
        const response = await fetch(uri, {
          headers: { accept: 'application/json' },
          cache: 'no-store',
        })
        if (!response.ok) {
          console.warn(
            `[pump-metadata] Metadata request failed (${response.status}) for ${uri} (attempt ${attemptNumber}/${METADATA_MAX_ATTEMPTS})`
          )
        } else {
          const json = (await response.json()) as TokenMetadata
          return json
        }
      } catch (error) {
        console.warn(
          `[pump-metadata] Metadata fetch error for ${uri} (attempt ${attemptNumber}/${METADATA_MAX_ATTEMPTS}):`,
          (error as Error).message
        )
      }

      if (attempt < METADATA_MAX_ATTEMPTS - 1) {
        const jitter = Math.random() * 200
        const delay = METADATA_BASE_DELAY_MS * 2 ** attempt + jitter
        await sleep(delay)
      }
    }

    console.warn(`[pump-metadata] Exhausted metadata retries for ${uri}`)
    return null
  })()

  metadataJsonPromises.set(uri, task)
  return task
}

async function fetchMetadataUriFromChain(mint: string): Promise<string | null> {
  try {
    const mintKey = new PublicKey(mint)
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    )
    const metadataAccount = await Metadata.fromAccountAddress(solanaConnection, metadataPda)
    const uri = metadataAccount?.data?.uri?.replace(/\0/g, '').trim()
    if (!uri) {
      console.warn(`[pump-metadata] Empty metadata URI from Metaplex for mint ${mint}`)
      return null
    }
    return normaliseMetadataUri(uri)
  } catch (error) {
    console.warn(
      `[pump-metadata] Failed to derive metadata URI for mint ${mint}:`,
      (error as Error).message
    )
    return null
  }
}

export async function getMetadataForMint(
  mint: string,
  providedUri?: string | null
): Promise<{ metadata: TokenMetadata | null; uri: string | null }> {
  if (!mint) {
    return { metadata: null, uri: null }
  }

  const normalizedProvidedUri = providedUri ? normaliseMetadataUri(providedUri) : null
  if (normalizedProvidedUri) {
    metadataUriByMint.set(mint, normalizedProvidedUri)
  }

  if (metadataByMint.has(mint)) {
    const metadata = await metadataByMint.get(mint)!
    const uri = metadataUriByMint.get(mint) ?? normalizedProvidedUri ?? null
    return { metadata, uri }
  }

  const existingUri = normalizedProvidedUri ?? metadataUriByMint.get(mint)
  if (existingUri) {
    const promise = fetchMetadataJson(existingUri).then((metadata) => {
      if (!metadata) {
        metadataUriByMint.set(mint, null)
      }
      return metadata
    })
    metadataByMint.set(mint, promise)
    const metadata = await promise
    metadataUriByMint.set(mint, existingUri)
    return { metadata, uri: existingUri }
  }

  const promise = (async () => {
    const derivedUri = await fetchMetadataUriFromChain(mint)
    if (!derivedUri) {
      metadataUriByMint.set(mint, null)
      return null
    }
    metadataUriByMint.set(mint, derivedUri)
    return fetchMetadataJson(derivedUri)
  })().then((metadata) => metadata)

  metadataByMint.set(mint, promise)
  const metadata = await promise
  const finalUri = metadataUriByMint.get(mint) ?? null
  return { metadata, uri: finalUri }
}

export function getCachedMetadataUri(mint: string): string | null {
  return metadataUriByMint.get(mint) ?? null
}


