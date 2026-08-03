export const HEAV_ADMIN_CONFIG = {
  supabaseUrl: "__SUPABASE_URL__",
  supabaseAnonKey: "__SUPABASE_ANON_KEY__",
};

export function isBackendConfigured() {
  return (
    HEAV_ADMIN_CONFIG.supabaseUrl.startsWith("https://") &&
    !HEAV_ADMIN_CONFIG.supabaseUrl.includes("__") &&
    HEAV_ADMIN_CONFIG.supabaseAnonKey.length > 40 &&
    !HEAV_ADMIN_CONFIG.supabaseAnonKey.includes("__")
  );
}
