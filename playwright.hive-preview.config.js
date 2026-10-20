import base from './playwright.hive.config.js';
export default {
 ...base, testMatch:'preview-no-login.spec.js',testIgnore:[],
 webServer:base.webServer.map((server,index)=> index === 1 ? {...server,env:{...server.env,
  VERCEL:'1',VERCEL_ENV:'preview',HIVE_PREVIEW_NO_LOGIN:'true',
  HIVE_PREVIEW_IDENTITY_EMAIL:'owner@example.test',HIVE_PREVIEW_IDENTITY_PASSWORD:'test-password',
  HIVE_PREVIEW_IDENTITY_ID:'10000000-0000-4000-8000-000000000001',
  HIVE_ENABLE_EMAIL_SEND:'true',HIVE_DEV_WORKSPACE_IDS:'033fe942-b8de-4298-9762-5f23550afbd9',
 }}:server),
};
