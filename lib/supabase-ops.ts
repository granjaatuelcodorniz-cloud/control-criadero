type SupabaseLikeResult = {
  error?: {
    message?: string;
  } | null;
};

export function assertSupabaseOk<T extends SupabaseLikeResult>(
  result: T,
  fallbackMessage = 'La operación no se pudo completar.',
): T {
  if (result.error) {
    throw new Error(result.error.message || fallbackMessage);
  }

  return result;
}

export function assertSupabaseAllOk(
  results: SupabaseLikeResult[],
  fallbackMessage = 'La operación no se pudo completar por completo.',
) {
  const failed = results.find(result => result.error);

  if (failed?.error) {
    throw new Error(failed.error.message || fallbackMessage);
  }
}

export function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallbackMessage;
}
