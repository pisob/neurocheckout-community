export function pullSourceOnce(options: {
  directory: string; environment: string; enabled: boolean;
}): Promise<{ ok: boolean; count?: number; complete?: boolean; code?: string }>;
export function sourceRetryDelay(result: {ok: boolean; complete?: boolean; code?: string}, failures?: number): number;
export function pauseSourceReads(options: {
  directory: string; environment: string; enabled: boolean;
}): void;
