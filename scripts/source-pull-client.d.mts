export function pullSourceOnce(options: {
  directory: string; environment: string; enabled: boolean;
}): Promise<{ ok: boolean; count?: number; complete?: boolean }>;
export function pauseSourceReads(options: {
  directory: string; environment: string; enabled: boolean;
}): void;
