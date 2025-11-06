import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'

type EventNames =
  | 'portfolio:update'
  | 'order:update'
  | 'trade:new'
  | 'agent:event'
  | 'token:update'
  | 'chat:new'

type Listener = (payload: unknown) => void

export function useEventStream(listeners: Partial<Record<EventNames, Listener>>) {
  useEffect(() => {
    const socket: Socket = io({
      path: '/api/stream',
      transports: ['websocket'],
    })

    for (const [event, handler] of Object.entries(listeners)) {
      if (handler) {
        socket.on(event as EventNames, handler)
      }
    }

    return () => {
      for (const [event, handler] of Object.entries(listeners)) {
        if (handler) {
          socket.off(event as EventNames, handler)
        } else {
          socket.off(event as EventNames)
        }
      }
      socket.disconnect()
    }
  }, [listeners])
}
