import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../hive-next/lib/hive/preview-mode.ts',import.meta.url),'utf8');
const outputText=source.replace('env: Record<string, string | undefined> =', 'env =');
const {previewNoLogin}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('no-login requires an explicit flag and can never bypass Vercel production authentication',()=>{
 for(const VERCEL_ENV of ['production','development',undefined]) {
  assert.equal(previewNoLogin({HIVE_PREVIEW_NO_LOGIN:'true',VERCEL:'1',VERCEL_ENV,NODE_ENV:'production'}),false);
 }
 assert.equal(previewNoLogin({VERCEL:'1',VERCEL_ENV:'preview'}),false);
 assert.equal(previewNoLogin({VERCEL:'1',VERCEL_ENV:'preview',HIVE_PREVIEW_NO_LOGIN:'true'}),true);
 assert.equal(previewNoLogin({NODE_ENV:'development',HIVE_PREVIEW_NO_LOGIN:'true'}),true);
 assert.equal(previewNoLogin({NODE_ENV:'production',HIVE_PREVIEW_NO_LOGIN:'true'}),false);
});
