import type { LocalDataStore } from './local-data-store.mjs';
type Options = {directory: string; environment: string; enabled: boolean};
export const HISTORY_INTERVAL_MS: number;
export class LocalOrderHistory {
  constructor(store: LocalDataStore);
  status(): {completeAt: number | null; nextDueAt: number | null; error: string | null; accounts: number};
}
export function refreshOrderHistoryOnce(options: Options): Promise<{ok: boolean; idle?: boolean; complete?: boolean; code?: string}>;
export function startOrderHistoryLoop(options: Options, active?: () => boolean): void;
