export class EmailArchive {
  installationId(): string | null;
  constructor(directory: string, clock?: () => number, environment?: string);
  store: { config: { shopId: string }; bindInstallation(id: string): void };
  db: {
    prepare(sql: string): { get(...params: unknown[]): Record<string, number | string | null> };
  };
  prepare(value: Record<string,unknown>): {archived: boolean; copy: Record<string,unknown>};
  confirm(id: string, sentAt: string): void;
  markConverted(id: string, convertedAt: string): void;
  clean(): void;
  get(id: string): Record<string,unknown> | null;
  close(): void;
}
