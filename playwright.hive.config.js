import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/hive-next',testMatch:'*.spec.js',testIgnore:'preview-no-login.spec.js',workers:1,timeout:30000,
 use:{baseURL:'http://localhost:4190',browserName:'chromium'},
 webServer:[
  {command:'node tests/hive-next/backend.mjs',url:'http://127.0.0.1:4499/health',reuseExistingServer:false},
  {command:'npm --prefix hive-next run start -- --port 4190',url:'http://localhost:4190/login',timeout:120000,reuseExistingServer:false,env:{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4499',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'',CLERK_SECRET_KEY:'',HIVE_CLERK_DB_BRIDGE_ENABLED:'false',HIVE_ENABLE_EMAIL_SEND:'false'}}
 ]
});
