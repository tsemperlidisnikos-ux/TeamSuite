const listeners = new Set<() => void>();
const APP_DATA_CHANNEL = 'teamsuite-app-data';

let channel: BroadcastChannel | null | undefined;

function getAppDataChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (typeof BroadcastChannel === 'undefined') {
    channel = null;
    return null;
  }
  channel = new BroadcastChannel(APP_DATA_CHANNEL);
  channel.onmessage = () => {
    void import('./repository').then((mod) => {
      mod.clearDataCache();
      listeners.forEach((listener) => listener());
    });
  };
  return channel;
}

export function subscribeAppData(listener: () => void): () => void {
  getAppDataChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAppDataChanged(): void {
  listeners.forEach((listener) => listener());
  try {
    getAppDataChannel()?.postMessage('changed');
  } catch {
    /* private mode / closed channel */
  }
}
