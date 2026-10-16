import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { LocalDataStore } from './local-data-store.mjs';

const DAY = 86400000;
const idPattern = /^community-(?:edge|marketing)-[1-9][0-9]{0,15}$/;
const validId = value => typeof value === 'string' && idPattern.test(value);
export class EmailArchive {
  constructor(directory, clock = Date.now, environment = undefined) {
    this.store = new LocalDataStore(directory, Date.now, environment); this.clock = clock;
    this.db = this.store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS email_archive (
      id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, sent_at INTEGER,
      ciphertext BLOB NOT NULL)`);
    // Separate table keeps the original encrypted-copy schema compatible with
    // existing installations and preserves known conversions beyond pagination.
    this.db.exec(`CREATE TABLE IF NOT EXISTS email_archive_conversions (
      id TEXT PRIMARY KEY, converted_at INTEGER NOT NULL)`);
    this.clean();
  }
  close() { this.store.close(); }
  installationId() {
    return this.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value || null;
  }
  clean() {
    this.db.prepare('DELETE FROM email_archive WHERE COALESCE(sent_at,created_at) < ?').run(this.clock() - 30 * DAY);
    this.db.prepare('DELETE FROM email_archive WHERE sent_at IS NULL AND created_at < ?').run(this.clock() - DAY);
    this.db.exec(`DELETE FROM email_archive WHERE sent_at IS NOT NULL
      AND id NOT IN (SELECT id FROM email_archive WHERE sent_at IS NOT NULL ORDER BY sent_at DESC,id DESC LIMIT 50)
      AND id NOT IN (SELECT c.id FROM email_archive_conversions c JOIN email_archive a ON a.id=c.id
        WHERE a.sent_at IS NOT NULL ORDER BY c.converted_at DESC,c.id DESC LIMIT 50)`);
    this.db.exec('DELETE FROM email_archive_conversions WHERE id NOT IN (SELECT id FROM email_archive)');
  }
  markConverted(id, convertedAt) {
    if (!validId(id) || typeof convertedAt !== 'string' || !Number.isFinite(Date.parse(convertedAt)) || Date.parse(convertedAt) > this.clock()+60000) throw Error('email_archive_invalid');
    this.db.prepare(`INSERT INTO email_archive_conversions(id,converted_at)
      SELECT id,? FROM email_archive WHERE id=?
      ON CONFLICT(id) DO UPDATE SET converted_at=MIN(converted_at,excluded.converted_at)`)
      .run(Date.parse(convertedAt),id);
  }
  prepare(value) {
    const keys = ['delivery_id','recipient_email','subject','body_html','body_text','agent_name','copy_signature'];
    if (!value || Object.keys(value).sort().join() !== keys.sort().join() || !validId(value.delivery_id)) throw Error('email_archive_invalid');
    if (value.delivery_id.startsWith('community-marketing-') &&
        !['customer_preference_proactive','intelligent_email_marketing'].includes(value.agent_name)) throw Error('email_archive_invalid');
    if (typeof value.copy_signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.copy_signature)) throw Error('email_archive_invalid');
    for (const [name, max] of [['recipient_email',320],['subject',998],['body_html',65536],['body_text',16384],['agent_name',100]]) {
      if (typeof value[name] !== 'string' || Buffer.byteLength(value[name]) > max) throw Error('email_archive_invalid');
    }
    return this.store.transaction(() => {
      this.clean();
      if (this.db.prepare('SELECT 1 FROM email_archive WHERE id=?').get(value.delivery_id)) {
        // Retries must send the same content, never replace an already stored copy.
        const stored = this.get(value.delivery_id);
        // A retry can select another template. Keep the reviewed original,
        // including its subject and signature; never overwrite it.
        if (['delivery_id','recipient_email','agent_name'].some(key => stored[key] !== value[key])) throw Error('email_archive_conflict');
        return { archived: true, copy: stored };
      }
      if (this.db.prepare('SELECT count(*) n FROM email_archive WHERE sent_at IS NULL').get().n >= 100) throw Error('email_archive_full');
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(this.store.config.encryptionKey,'hex'),iv);
      cipher.setAAD(Buffer.from(`email-archive-v1:${this.store.config.shopId}:${value.delivery_id}`));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
      this.db.prepare('INSERT INTO email_archive VALUES (?,?,NULL,?)').run(value.delivery_id,this.clock(),Buffer.concat([iv,cipher.getAuthTag(),encrypted]));
      return { archived: true, copy: value };
    });
  }
  confirm(id, sentAt) {
    if (!validId(id) || typeof sentAt !== 'string' || !Number.isFinite(Date.parse(sentAt)) || Date.parse(sentAt) > this.clock()+60000) throw Error('email_archive_invalid');
    this.store.transaction(() => {
      const changed = this.db.prepare('UPDATE email_archive SET sent_at=COALESCE(sent_at,?) WHERE id=?').run(Date.parse(sentAt),id);
      if (changed.changes !== 1) throw Error('email_archive_unavailable');
      this.clean();
    });
  }
  get(id) {
    if (!validId(id)) return null;
    const row = this.db.prepare('SELECT * FROM email_archive WHERE id=? AND COALESCE(sent_at,created_at)>=?').get(id,this.clock()-30*DAY);
    if (!row) return null;
    const bytes=Buffer.from(row.ciphertext), decipher=createDecipheriv('aes-256-gcm',Buffer.from(this.store.config.encryptionKey,'hex'),bytes.subarray(0,12));
    decipher.setAAD(Buffer.from(`email-archive-v1:${this.store.config.shopId}:${id}`));decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
  }
}
