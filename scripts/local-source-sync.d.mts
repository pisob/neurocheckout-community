import type { LocalDataStore } from "./local-data-store.mjs";

export class SourceSynchronizer {
  constructor(store: LocalDataStore);
  configure(configuration: { endpoint: string; secret: string }): void;
}
