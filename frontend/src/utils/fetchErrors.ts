/**
 * Tries to extract a `message` field from a non-OK fetch response body.
 * Falls back to the provided default if the body is missing or not JSON.
 */
export const extractFetchErrorMessage = async (
  res: Response,
  defaultMessage: string,
): Promise<string> => {
  try {
    // Prefer cloning so the caller can still read the body if it wants,
    // but fall back to reading directly when clone is unavailable (e.g. in
    // test mocks that don't implement the full Response interface).
    const source = typeof res.clone === 'function' ? res.clone() : res;
    const body = await source.json();
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // Body wasn't JSON; fall through.
  }
  return defaultMessage;
};

/**
 * True when a thrown error is an AbortController abort, used by hooks that
 * cancel in-flight fetches on unmount.
 */
export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === 'AbortError'
    : Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
