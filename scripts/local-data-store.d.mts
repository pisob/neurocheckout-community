export function initializeLocalData(directory: string, shopId: string, environment?: string): {
  shopId: string;
  environment: string;
};
export function loadLocalDataConfig(directory: string, environment?: string): { shopId: string; environment: string };

export class LocalDataStore {
  constructor(directory: string, clock?: () => number, environment?: string);
  config: { shopId: string };
  db: {
    prepare(sql: string): { get(...params: unknown[]): Record<string, number | string | null> };
  };
  close(): void;
}
