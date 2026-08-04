export const HEAV_ADMIN_CONFIG = {
  supabaseUrl: "https://bkazlpqjvbuhwmjcwexn.supabase.co",
  supabaseAnonKey: "sb_publishable_-IzxxXGqV19S-MaPLthWpw_oiPurd-2",
};

export function isBackendConfigured() {
  return (
    HEAV_ADMIN_CONFIG.supabaseUrl.startsWith("https://") &&
    !HEAV_ADMIN_CONFIG.supabaseUrl.includes("__") &&
    HEAV_ADMIN_CONFIG.supabaseAnonKey.startsWith("sb_publishable_") &&
    !HEAV_ADMIN_CONFIG.supabaseAnonKey.includes("__")
  );
}
