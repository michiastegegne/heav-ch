/** Server-side only flag. Vercel production can never enable the bypass. */
export function previewNoLogin(env: Record<string, string | undefined> = process.env) {
  return env.HIVE_PREVIEW_NO_LOGIN === 'true' &&
    (env.VERCEL_ENV === 'preview' || (!env.VERCEL && env.NODE_ENV !== 'production'));
}
