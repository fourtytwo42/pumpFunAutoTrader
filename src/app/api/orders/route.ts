import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { eventBus } from '@/lib/events'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const walletId = params.get('walletId')
    const rawStatus = params.get('status')
    const limitParam = params.get('limit')

    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required' }, { status: 400 })
    }

    let statusFilter: string[] | undefined
    if (rawStatus) {
      if (rawStatus === 'active') {
        statusFilter = ['pending', 'open', 'accepted', 'queued']
      } else {
        statusFilter = rawStatus
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      }
    }

    const limit = Math.min(Number(limitParam ?? '50') || 50, 100)

    const orders = await prisma.order.findMany({
      where: {
        walletId,
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
      },
      include: {
        executions: {
          orderBy: { ts: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        tokenMint: order.tokenMint,
        side: order.side,
        status: order.status,
        qtyTokens: order.qtyTokens ? Number(order.qtyTokens) : null,
        qtySol: order.qtySol ? Number(order.qtySol) : null,
        limitPriceSol: order.limitPriceSol ? Number(order.limitPriceSol) : null,
        slippageBps: order.slippageBps,
        reason: order.reason,
        txSig: order.txSig,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        executions: order.executions.map((execution) => ({
          id: execution.id,
          ts: execution.ts,
          fillQty: Number(execution.fillQty),
          costSol: Number(execution.costSol),
          feeSol: Number(execution.feeSol),
          priceUsd: execution.priceUsd ? Number(execution.priceUsd) : null,
          txSig: execution.txSig,
        })),
      })),
    })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletId, mint, side, qtyTokens, qtySol, slippageBps, limitSol, userId } = body || {}

    if (!walletId || !mint || !side) {
      return NextResponse.json({ error: 'walletId, mint and side are required' }, { status: 400 })
    }

    const order = await prisma.order.create({
      data: {
        walletId,
        tokenMint: mint,
        side,
        status: 'pending',
        qtyTokens: qtyTokens != null ? qtyTokens : undefined,
        qtySol: qtySol != null ? qtySol : undefined,
        limitPriceSol: limitSol != null ? limitSol : undefined,
        slippageBps: slippageBps ?? null,
        userId: userId ?? null,
      },
    })

    eventBus.emitEvent({
      type: 'order:update',
      payload: { walletId, orderId: order.id, status: order.status },
    })

    return NextResponse.json({ ok: true, order })
  } catch (error) {
    console.error('Create order error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
