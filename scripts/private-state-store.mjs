import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const token = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validState = state => state && Object.keys(state).sort().join() === 'revision,value' && token(state.revision)
  && typeof state.value === 'string' && Buffer.byteLength(state.value) <= 8192;

// Opaque application state. Decisions and signing keys remain outside the client.
export class PrivateStateStore {
  constructor(store, clock = Date.now) {
    this.store = store; this.clock = clock;
    store.db.exec(`CREATE TABLE IF NOT EXISTS private_state (
      key TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, ciphertext BLOB NOT NULL)`);
  }
  aad(key) {
    const installation = this.store.db.prepare("SELECT value FROM meta WHERE name='installation_id'").get()?.value;
    if (!installation) throw Error('private_state_unavailable');
    return Buffer.from(JSON.stringify(['private-state-v1',this.store.config.shopId,installation,key]));
  }
  get(key) {
    if (!token(key)) throw Error('private_state_invalid');
    const row = this.store.db.prepare('SELECT ciphertext FROM private_state WHERE key=? AND updated_at>=?')
      .get(key,this.clock()-90*86400000);
    if (!row) return null;
    const bytes = Buffer.from(row.ciphertext);
    const decipher = createDecipheriv('aes-256-gcm',Buffer.from(this.store.config.encryptionKey,'hex'),bytes.subarray(0,12));
    decipher.setAAD(this.aad(key)); decipher.setAuthTag(bytes.subarray(12,28));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
    if (!validState(value)) throw Error('private_state_invalid');
    return value;
  }
  execute(record, write = false) {
    if (!record || Object.keys(record).sort().join() !== (write ? 'expected_revision,key,state' : 'key') || !token(record.key)
      || (write && (!validState(record.state) || (record.expected_revision !== null && !token(record.expected_revision))))) {
      throw Error('private_state_invalid');
    }
    if (!write) return this.get(record.key);
    return this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM private_state WHERE updated_at<?').run(this.clock()-90*86400000);
      const previous = this.get(record.key);
      if (previous?.revision === record.state.revision && previous.value === record.state.value) return previous;
      if ((previous?.revision || null) !== record.expected_revision) throw Error('private_state_conflict');
      if (!previous && this.store.db.prepare('SELECT count(*) n FROM private_state').get().n >= 10000) throw Error('private_state_full');
      const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(this.store.config.encryptionKey,'hex'),iv);
      cipher.setAAD(this.aad(record.key));
      const encrypted=Buffer.concat([cipher.update(JSON.stringify(record.state)),cipher.final()]);
      this.store.db.prepare('INSERT INTO private_state VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET updated_at=excluded.updated_at,ciphertext=excluded.ciphertext')
        .run(record.key,this.clock(),Buffer.concat([iv,cipher.getAuthTag(),encrypted]));
      return record.state;
    });
  }
}
