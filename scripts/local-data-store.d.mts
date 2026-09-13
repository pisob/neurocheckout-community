export function initializeLocalData(directory: string, shopId: string): {
  shopId: string;
  environment: string;
};

export class LocalDataStore {
  constructor(directory: string);
  config: { shopId: string };
  close(): void;
}
