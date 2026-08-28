export type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export function ok<T>(data: T): ApiResult<T> {
  return { success: true, data };
}

export function fail<T = never>(error: string): ApiResult<T> {
  return { success: false, error };
}

export async function apiClient<T>(
  operation: () => T | Promise<T>,
): Promise<ApiResult<T>> {
  try {
    const data = await operation();
    return ok(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Άγνωστο σφάλμα';
    return fail(message);
  }
}
