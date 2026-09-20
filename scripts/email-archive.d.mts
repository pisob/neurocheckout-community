export class EmailArchive {
  constructor(directory: string, clock?: () => number);
  store: { config: { shopId: string }; bindInstallation(id: string): void };
  db: {
    prepare(sql: string): { get(...params: unknown[]): Record<string, number | string | null> };
  };
  prepare(value: Record<string,string>): {archived: boolean; copy: Record<string,string>};
  confirm(id: string, sentAt: string): void;
  clean(): void;
  get(id: string): Record<string,string> | null;
  close(): void;
}
