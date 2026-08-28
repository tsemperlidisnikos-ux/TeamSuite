import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');

const account = await source('api/sync/account.ts');
const store = await source('api/lib/serverStore.ts');
const viva = await source('api/viva.ts');
const email = await source('api/send-email.ts');
const publicJoin = await source('api/public-join.ts');
const auth = await source('src/auth/auth.ts');
const durableKv = await source('api/lib/durableKv.ts');
const serverStore = await source('api/lib/serverStore.ts');
const backupArchive = await source('src/utils/backupArchive.ts');

assert.match(store, /SS360_ALLOW_INSECURE_SYNC === '1'/, 'sync must require explicit local opt-in');
assert.match(account, /Μόνο Platform Admin μπορεί να αποθηκεύσει account bundle/, 'account bundle writes must be privileged');
assert.match(account, /Forbidden: club mismatch/, 'media must enforce club isolation');
assert.match(account, /Unsupported media type/, 'media must validate content types');
assert.match(viva, /assertPlatformAdminOrSecret\(req, res\)/, 'settlements must be privileged');
assert.match(viva, /if \(!secret\) return false/, 'Viva webhook must fail closed');
assert.match(email, /loadClubNotifyConfig\(clubId\)/, 'email must use server-side SMTP configuration');
assert.doesNotMatch(email, /body\.smtp/, 'email endpoint must not trust caller SMTP settings');
assert.match(publicJoin, /Forbidden: club mismatch/, 'public application reads must be tenant scoped');
assert.match(auth, /Μόνο Platform Admin μπορεί να κάνει impersonation/, 'impersonation must be role guarded');
assert.match(account, /Μόνο Platform Admin μπορεί να διαγράψει ιστορικό εισόδων/, 'login activity delete must be platform admin');
assert.match(durableKv, /kvIncrementWithExpiry/, 'rate limiting must use an atomic Redis counter when available');
assert.match(account, /Πολλά αιτήματα upload/, 'media uploads must be rate limited');
assert.match(viva, /Πολλά webhook requests/, 'Viva webhooks must be rate limited');
assert.match(publicJoin, /Πολλά αιτήματα εγγραφής/, 'public registration must be rate limited');
assert.match(email, /Πολλά αιτήματα email/, 'email sending must be rate limited');
assert.match(durableKv, /kvSetIfAbsent/, 'settlement claims must use an atomic Redis set-if-absent');
assert.match(serverStore, /Settlement requires orderCode/, 'settlement validation must reject incomplete identifiers');
assert.match(backupArchive, /MAX_BACKUP_FILE_BYTES/, 'backup restore must cap input size');
assert.match(backupArchive, /isAppDataShape/, 'backup restore must validate app data shape');

console.log('Security regression checks passed.');
