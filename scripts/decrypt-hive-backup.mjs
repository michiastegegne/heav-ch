// Offline decryption. Password comes from stdin; never a command-line argument.
import { readFile, writeFile } from 'node:fs/promises';
import { decryptBackup } from '../hive-next/lib/hive/backup-crypto.mjs';
if (process.argv.length !== 4) {
  console.error('Usage: node scripts/decrypt-hive-backup.mjs input.hivebackup output.json < password-file');
  process.exit(1);
}
try {
  let password = ''; for await (const chunk of process.stdin) password += chunk;
  const encrypted = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const decrypted = await decryptBackup(encrypted, password.replace(/\r?\n$/, ''));
  await writeFile(process.argv[3], JSON.stringify(decrypted, null, 2), {mode:0o600, flag:'wx'});
  console.log('Decrypted and authenticated. Output created with owner-only permissions.');
} catch { console.error('Decryption failed: check password, file integrity and output path.'); process.exitCode = 1; }
