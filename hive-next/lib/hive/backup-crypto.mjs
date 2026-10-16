const iterations = 600000;
const base64 = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };
const unbase64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));
async function key(password, salt, usage) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, [usage]);
}
export async function encryptBackup(payload, password) {
  if (password.length < 16) throw new Error('Bitte mindestens 16 Zeichen verwenden.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await key(password, salt, 'encrypt'), new TextEncoder().encode(JSON.stringify(payload)));
  return {format:'hive-encrypted-backup', version:1, cipher:'AES-256-GCM', kdf:'PBKDF2-SHA256', iterations, salt:base64(salt), iv:base64(iv), ciphertext:base64(new Uint8Array(encrypted))};
}
export async function decryptBackup(envelope, password) {
  if (envelope.format !== 'hive-encrypted-backup' || envelope.version !== 1 || envelope.cipher !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== iterations) throw new Error('Unbekanntes Sicherungsformat.');
  const salt = unbase64(envelope.salt), iv = unbase64(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('Ungültige Sicherung.');
  const plaintext = await crypto.subtle.decrypt({name:'AES-GCM', iv}, await key(password, salt, 'decrypt'), unbase64(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
