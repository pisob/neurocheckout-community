export type RelayOptions = {
  enabled: boolean; environment: string; directory: string; secret: string;
  cloudUrl: string; clientId: string; port: string; version: string;
};
export function saveRelayCredential(options: RelayOptions, credential: unknown): Promise<void>;
export function relayOnce(options: RelayOptions, fetchImpl?: typeof fetch): Promise<boolean>;
