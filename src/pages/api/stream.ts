import type { NextApiRequest, NextApiResponse } from 'next'
import type { Server as HTTPServer } from 'http'
import type { Socket } from 'net'
import { Server as IOServer } from 'socket.io'
import { eventBus } from '@/lib/events'

type NextApiResponseWithSocket = NextApiResponse & {
  socket: Socket & {
    server: HTTPServer & {
      io?: IOServer
    }
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server, {
      path: '/api/stream',
      cors: {
        origin: '*',
      },
    })

    eventBus.on('portfolio:update', (payload) => io.emit('portfolio:update', payload))
    eventBus.on('order:update', (payload) => io.emit('order:update', payload))
    eventBus.on('trade:new', (payload) => io.emit('trade:new', payload))
    eventBus.on('agent:event', (payload) => io.emit('agent:event', payload))
    eventBus.on('token:update', (payload) => io.emit('token:update', payload))
    eventBus.on('chat:new', (payload) => io.emit('chat:new', payload))

    res.socket.server.io = io
  }

  res.end()
}
