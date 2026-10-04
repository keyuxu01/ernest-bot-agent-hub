/** 把未知异常压成可记录的短消息，避免直接 dump 对象 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error ?? 'unknown');
}

export { errorMessage };
