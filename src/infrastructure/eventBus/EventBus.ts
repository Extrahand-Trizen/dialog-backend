import logger from '../logging/logger';

export type DomainEventType =
  | 'MESSAGE_SENT'
  | 'MESSAGE_FAILED'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ'
  | 'TEMPLATE_APPROVED'
  | 'TEMPLATE_REJECTED'
  | 'PHONE_QUALITY_RED'
  | 'WEBHOOK_PROCESSING_FAILED';
  
export type DomainEventPayload = Record<string, unknown>;

export type DomainEventHandler = (payload: DomainEventPayload) => void | Promise<void>;

const handlers = new Map<DomainEventType, DomainEventHandler[]>();

export const EventBus = {
  on(event: DomainEventType, handler: DomainEventHandler): void {
    const existing = handlers.get(event) ?? [];
    handlers.set(event, [...existing, handler]);
  },

  async emit(event: DomainEventType, payload: DomainEventPayload): Promise<void> {
    const eventHandlers = handlers.get(event) ?? [];
    for (const handler of eventHandlers) {
      try {
        await handler(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('EventBus handler failed', { event, message });
      }
    }
  },

  clear(): void {
    handlers.clear();
  },
};
