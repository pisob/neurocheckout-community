export type AvailabilityOptions = {
  directory: string; secret: string; cloudUrl: string; clientId: string;
};
export function saveAvailabilityCredential(options: AvailabilityOptions & { token: string }): Promise<void>;
export function heartbeatOnce(options: AvailabilityOptions & { port: string; version: string }, fetchImpl?: typeof fetch): Promise<boolean>;
