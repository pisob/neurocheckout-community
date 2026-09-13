export type AutomaticSourceBinding = {
  schema: 1;
  shop_id: string;
  platform?: string;
  endpoint: string;
  secret: string;
};

export function configureAutomaticSource(directory: string, binding: AutomaticSourceBinding): {
  status: string;
  shopId: string;
};
export function automaticSourceStatus(directory: string): {
  configured: boolean;
  ready: boolean;
  shopId?: string;
  lastSuccessAt?: number;
  lastCompleteAt?: number;
};
