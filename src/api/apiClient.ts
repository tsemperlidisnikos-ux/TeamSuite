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

function friendlyApiError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes('unexpected token') ||
    m.includes('is not valid json') ||
    m.includes('unexpected end of json') ||
    m.includes('json.parse')
  ) {
    return 'Ο server δεν επέστρεψε έγκυρη απάντηση. Ξαναδοκιμάστε· αν συνεχίσει, το payload μπορεί να είναι πολύ μεγάλο.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return 'Δεν υπάρχει σύνδεση με τον server. Ελέγξτε το δίκτυο και ξαναδοκιμάστε.';
  }
  return message;
}

export async function apiClient<T>(
  operation: () => T | Promise<T>,
): Promise<ApiResult<T>> {
  try {
    const data = await operation();
    return ok(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Άγνωστο σφάλμα';
    return fail(friendlyApiError(message));
  }
}
