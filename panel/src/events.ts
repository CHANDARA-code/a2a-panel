import { useEffect, useRef, useState } from "react";

type ConnectionState = {
  connected: boolean;
  failed: boolean;
};

const RECONNECT_MS = 5000;

let eventSource: EventSource | null = null;
let reconnectTimer: number | null = null;
let subscribersCount = 0;
let connectionState: ConnectionState = {
  connected: false,
  failed: false,
};

const connectionListeners = new Set<(state: ConnectionState) => void>();
const eventListeners = new Map<string, Set<(event: MessageEvent) => void>>();

function setConnection(next: ConnectionState) {
  connectionState = next;
  for (const listener of connectionListeners) {
    listener(connectionState);
  }
}

function clearReconnect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeEventSource() {
  clearReconnect();
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function openEventSource() {
  if (eventSource || subscribersCount <= 0 || document.hidden) return;
  const source = new EventSource("/api/events");
  eventSource = source;

  source.onopen = () => {
    setConnection({ connected: true, failed: false });
  };

  source.onerror = () => {
    setConnection({ connected: false, failed: true });
    if (source.readyState === EventSource.CLOSED && eventSource === source) {
      eventSource = null;
      clearReconnect();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        openEventSource();
      }, RECONNECT_MS);
    }
  };

  for (const [name, listeners] of eventListeners) {
    for (const listener of listeners) {
      source.addEventListener(name, listener as EventListener);
    }
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    closeEventSource();
  } else {
    openEventSource();
  }
});

function retain() {
  subscribersCount++;
  openEventSource();
}

function release() {
  subscribersCount--;
  if (subscribersCount <= 0) {
    subscribersCount = 0;
    closeEventSource();
    setConnection({ connected: false, failed: false });
  }
}

function subscribeToEvent(name: string, listener: (event: MessageEvent) => void) {
  let listeners = eventListeners.get(name);
  if (!listeners) {
    listeners = new Set();
    eventListeners.set(name, listeners);
  }
  listeners.add(listener);
  eventSource?.addEventListener(name, listener as EventListener);
  retain();

  return () => {
    const current = eventListeners.get(name);
    if (current) {
      current.delete(listener);
      if (current.size === 0) {
        eventListeners.delete(name);
      }
    }
    eventSource?.removeEventListener(name, listener as EventListener);
    release();
  };
}

export function useServerEvent<T = any>(name: string, handler: (data: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      let parsed: T;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      handlerRef.current(parsed);
    };
    return subscribeToEvent(name, listener);
  }, [name]);
}

export function useServerConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(() => connectionState);

  useEffect(() => {
    const listener = (next: ConnectionState) => setState(next);
    connectionListeners.add(listener);
    retain();
    setState(connectionState);

    return () => {
      connectionListeners.delete(listener);
      release();
    };
  }, []);

  return state;
}
