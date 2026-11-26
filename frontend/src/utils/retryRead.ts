// Retry reads only. Mutations are never automatically repeated by this helper.
export async function retryRead<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await read(); }
    catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (signal?.aborted || attempt >= 2 || (status !== undefined && status !== 408 && status !== 429 && status < 500)) throw error;
      await new Promise<void>((resolve, reject) => {
        const stop = () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = window.setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, 1000 * 2 ** attempt);
        signal?.addEventListener('abort', stop, { once: true });
        if (signal?.aborted) stop();
      });
    }
  }
}
