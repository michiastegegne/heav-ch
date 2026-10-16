import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup } from '../hive-next/lib/hive/backup-crypto.mjs';
test('encrypted export round trips Unicode, records, totals and stable identifiers', async () => {
 const data={workspaceId:'stable-id',records:{customers:[{id:'customer-id',name:'Müller 🐝'}],invoices:[{total_rappen:234500}]}};
 const password='a unique long passphrase for the backup';
 const encrypted=await encryptBackup(data,password);
 assert.equal(JSON.stringify(encrypted).includes('Müller'),false);
 assert.deepEqual(await decryptBackup(encrypted,password),data);
 const second=await encryptBackup(data,password);
 assert.notEqual(second.salt,encrypted.salt); assert.notEqual(second.iv,encrypted.iv);
 await assert.rejects(decryptBackup(encrypted,'incorrect password'));
 const tampered={...encrypted,ciphertext:(encrypted.ciphertext[0]==='A'?'B':'A')+encrypted.ciphertext.slice(1)};
 await assert.rejects(decryptBackup(tampered,password));
 await assert.rejects(decryptBackup({...encrypted,iterations:1},password));
 await assert.rejects(encryptBackup(data,'short'));
});
