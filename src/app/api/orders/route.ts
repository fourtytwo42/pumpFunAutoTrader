import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { eventBus } from '@/lib/events'
import { requireAuth } from '@/lib/middleware'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
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
        userId: session.user.id,
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
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { walletId, mint, side, qtyTokens, qtySol, slippageBps, limitPriceSol } = body || {}

    if (!walletId || !mint || !side) {
      return NextResponse.json({ error: 'walletId, mint and side are required' }, { status: 400 })
    }

    if (!['buy', 'sell'].includes(side)) {
      return NextResponse.json({ error: 'side must be buy or sell' }, { status: 400 })
    }

    if (side === 'buy' && !qtySol) {
      return NextResponse.json({ error: 'qtySol is required for buy orders' }, { status: 400 })
    }

    if (side === 'sell' && !qtyTokens) {
      return NextResponse.json({ error: 'qtyTokens is required for sell orders' }, { status: 400 })
    }

    // Risk validation for AI traders
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAiAgent: true },
    })

    if (user?.isAiAgent) {
      const { validateTrade } = await import('@/lib/risk-profiles')
      const { getSolPrice } = await import('@/lib/pump-api')

      const solPrice = await getSolPrice()
      const amountUSD = side === 'buy' ? (qtySol || 0) * (solPrice?.solUsd || 0) : 0

      const validation = await validateTrade(session.user.id, {
        mintAddress: mint,
        side: side as 'buy' | 'sell',
        amountUSD,
        slippageBps: slippageBps || 500,
      })

      if (!validation.valid) {
        return NextResponse.json(
          {
            error: 'Risk validation failed',
            reason: validation.reason,
            violations: validation.violations,
          },
          { status: 403 }
        )
      }
    }

    const order = await prisma.order.create({
      data: {
        walletId,
        tokenMint: mint,
        side,
        status: limitPriceSol ? 'open' : 'pending',
        qtyTokens: qtyTokens != null ? qtyTokens : undefined,
        qtySol: qtySol != null ? qtySol : undefined,
        limitPriceSol: limitPriceSol != null ? limitPriceSol : undefined,
        slippageBps: slippageBps ?? null,
        userId: session.user.id,
      },
    })

    eventBus.emitEvent({
      type: 'order:update',
      payload: { walletId, orderId: order.id, status: order.status },
    })

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        tokenMint: order.tokenMint,
        side: order.side,
        status: order.status,
        qtyTokens: order.qtyTokens ? Number(order.qtyTokens) : null,
        qtySol: order.qtySol ? Number(order.qtySol) : null,
        limitPriceSol: order.limitPriceSol ? Number(order.limitPriceSol) : null,
        slippageBps: order.slippageBps,
        createdAt: order.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Create order error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = request.nextUrl.searchParams
    const orderId = params.get('orderId')
    const cancelAll = params.get('cancelAll') === 'true'

    if (cancelAll) {
      // Cancel all open orders for the user
      const result = await prisma.order.updateMany({
        where: {
          userId: session.user.id,
          status: { in: ['pending', 'open', 'queued'] },
        },
        data: {
          status: 'cancelled',
        },
      })

      return NextResponse.json({
        ok: true,
        cancelledCount: result.count,
      })
    }

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (!['pending', 'open', 'queued'].includes(order.status)) {
      return NextResponse.json(
        { error: `Cannot cancel order with status: ${order.status}` },
        { status: 400 }
      )
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'cancelled' },
    })

    eventBus.emitEvent({
      type: 'order:update',
      payload: { walletId: order.walletId, orderId: order.id, status: 'cancelled' },
    })

    return NextResponse.json({
      ok: true,
      orderId,
      previousStatus: order.status,
    })
  } catch (error) {
    console.error('Cancel order error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
