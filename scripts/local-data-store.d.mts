export function initializeLocalData(directory: string, shopId: string): {
  shopId: string;
  environment: string;
};

export class LocalDataStore {
  constructor(directory: string);
  config: { shopId: string };
  db: {
    prepare(sql: string): { get(...params: unknown[]): Record<string, number | string | null> };
  };
  close(): void;
}
