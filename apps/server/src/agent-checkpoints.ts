import { MemorySaver } from '@langchain/langgraph';
import { serialize, deserialize } from 'node:v8';
import type { Store } from './store';
// Use the library's pending-write ordering/serialization semantics. Persist the
// bounded, per-task native saver state atomically; no external database service.
export class AgentCheckpoints extends MemorySaver {
  constructor(
    private store: Store,
    private taskId: string,
    private isOpen: () => boolean,
  ) {
    super();
    const row = store.db
      .prepare('SELECT snapshot FROM agent_checkpoints WHERE taskId=?')
      .get(taskId) as { snapshot: Uint8Array } | undefined;
    if (row) {
      const saved = deserialize(row.snapshot) as {
        version: number;
        storage: MemorySaver['storage'];
        writes: MemorySaver['writes'];
      };
      if (saved.version !== 1) throw Error('Unsupported checkpoint version');
      this.storage = saved.storage;
      this.writes = saved.writes;
    }
  }
  private persist() {
    if (!this.isOpen()) throw Error('Agent stopped');
    this.store.db
      .prepare(
        'INSERT INTO agent_checkpoints(taskId,snapshot) VALUES(?,?) ON CONFLICT(taskId) DO UPDATE SET snapshot=excluded.snapshot',
      )
      .run(this.taskId, serialize({ version: 1, storage: this.storage, writes: this.writes }));
  }
  override async put(...args: Parameters<MemorySaver['put']>) {
    const result = await super.put(...args);
    this.persist();
    return result;
  }
  override async putWrites(...args: Parameters<MemorySaver['putWrites']>) {
    await super.putWrites(...args);
    this.persist();
  }
}
