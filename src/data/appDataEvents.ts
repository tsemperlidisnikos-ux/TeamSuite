const listeners = new Set<() => void>();

export function subscribeAppData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAppDataChanged(): void {
  listeners.forEach((listener) => listener());
}
