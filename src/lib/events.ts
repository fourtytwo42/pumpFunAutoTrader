import EventEmitter from 'eventemitter3'

export type AppEvent =
  | { type: 'portfolio:update'; payload: unknown }
  | { type: 'order:update'; payload: unknown }
  | { type: 'trade:new'; payload: unknown }
  | { type: 'agent:event'; payload: unknown }
  | { type: 'token:update'; payload: unknown }
  | { type: 'chat:new'; payload: unknown }

class AppEventBus extends EventEmitter<AppEvent['type']> {
  emitEvent(event: AppEvent) {
    this.emit(event.type, event.payload)
  }
}

export const eventBus = new AppEventBus()
