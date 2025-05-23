class SimpleEventEmitter {
  constructor() {
    this.listeners = {};
  }
  on(eventName, listener) {
    if (typeof listener !== 'function') {
      console.error(
        `[SimpleEventEmitter] Listener for event "${eventName}" is not a function.`,
      );
      return;
    }
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(listener);
  }
  off(eventName, listenerToRemove) {
    if (!this.listeners[eventName]) {
      return;
    }
    const initialLength = this.listeners[eventName].length;
    this.listeners[eventName] = this.listeners[eventName].filter(
      (listener) => listener !== listenerToRemove,
    );
  }
  emit(eventName, ...args) {
    if (!this.listeners[eventName] || this.listeners[eventName].length === 0) {
      return;
    }
    const listenersToExecute = [...this.listeners[eventName]];
    listenersToExecute.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error(
          `[SimpleEventEmitter] Error in listener for event "${eventName}":`,
          error,
        );
      }
    });
  }
}

module.exports = SimpleEventEmitter;
