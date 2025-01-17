export type EventHandlerCallback<T = Record<string, any>> = (event: T) => void;

interface EventHandlers {
  [key: string]: Array<EventHandlerCallback<any>>;
}

const sleep = (t: number): Promise<void> => new Promise((r) => setTimeout(r, t));

/**
 * Inherited class for RealtimeAPI and RealtimeClient
 * Adds basic event handling
 */
export class RealtimeEventHandler {
  private eventHandlers: EventHandlers;
  private nextEventHandlers: EventHandlers;

  /**
   * Create a new RealtimeEventHandler instance
   */
  constructor() {
    this.eventHandlers = {};
    this.nextEventHandlers = {};
  }

  /**
   * Clears all event handlers
   */
  clearEventHandlers(): true {
    this.eventHandlers = {};
    this.nextEventHandlers = {};
    return true;
  }

  /**
   * Listen to specific events
   */
  public on<T extends Record<string, any>>(eventName: string, callback: EventHandlerCallback<T>): EventHandlerCallback<T> {
    this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
    this.eventHandlers[eventName].push(callback);
    return callback;
  }

  /**
   * Listen for the next event of a specified type
   */
  public onNext<T extends Record<string, any>>(eventName: string, callback: EventHandlerCallback<T>): EventHandlerCallback<T> {
    this.nextEventHandlers[eventName] = this.nextEventHandlers[eventName] || [];
    this.nextEventHandlers[eventName].push(callback);
    return callback;
  }

  /**
   * Turns off event listening for specific events
   * Calling without a callback will remove all listeners for the event
   */
  public off<T extends Record<string, any>>(eventName: string, callback?: EventHandlerCallback<T>): true {
    if (!callback) {
      delete this.eventHandlers[eventName];
      return true;
    }
    const handlers = this.eventHandlers[eventName] || [];
    const index = handlers.indexOf(callback);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    return true;
  }

  /**
   * Turns off event listening for the next event of a specific type
   * Calling without a callback will remove all listeners for the next event
   */
  public offNext<T extends Record<string, any>>(eventName: string, callback?: EventHandlerCallback<T>): true {
    if (!callback) {
      delete this.nextEventHandlers[eventName];
      return true;
    }
    const nextHandlers = this.nextEventHandlers[eventName] || [];
    const index = nextHandlers.indexOf(callback);
    if (index !== -1) {
      nextHandlers.splice(index, 1);
    }
    return true;
  }

  /**
   * Emit an event
   */
  protected emit<T extends Record<string, any>>(eventName: string, event: T): void {
    const handlers = this.eventHandlers[eventName] || [];
    const nextHandlers = this.nextEventHandlers[eventName] || [];
    this.nextEventHandlers[eventName] = [];
    [...handlers, ...nextHandlers].forEach((handler) => handler(event));
  }

  /**
   * Dispatch an event
   */
  public dispatch<T extends Record<string, any>>(eventName: string, event: T): true {
    this.emit(eventName, event);
    return true;
  }

  /**
   * Waits for next event of a specific type and returns the payload
   */
  async waitForNext<T extends Record<string, any>>(eventName: string, timeout: number | null = null): Promise<T | null> {
    let nextEvent: T | null = null;
    const promise = new Promise<T>((resolve) => {
      this.onNext(eventName, (event: T) => {
        nextEvent = event;
        resolve(event);
      });
    });

    if (timeout !== null) {
      try {
        await Promise.race([promise, sleep(timeout)]);
      } catch (e) {
        // Timeout reached
      }
    } else {
      await promise;
    }
    return nextEvent;
  }
}
