export function encryptBackup(payload: unknown, password: string): Promise<Record<string, unknown>>;
export function decryptBackup(envelope: Record<string, unknown>, password: string): Promise<unknown>;
