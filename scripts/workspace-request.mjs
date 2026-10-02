// A shop selector is only a request context, never an authorization grant.
// Cloud revalidates the owner, installation link and current offer on every use.
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function workspaceRequestShop(path, body) {
  if (typeof path !== 'string' || !path.startsWith('/api/v1/') || path.startsWith('//')) {
    throw new Error('community_workspace_request_invalid');
  }
  const url = new URL(path, 'https://community.invalid');
  const candidates = url.searchParams.getAll('shop_uuid');
  const pathShop = /^\/api\/v1\/member\/shops\/([^/]+)(?:\/|$)/.exec(url.pathname)?.[1];
  if (pathShop && pathShop !== 'platforms') candidates.push(decodeURIComponent(pathShop));
  if (typeof body === 'string') {
    const payload = JSON.parse(body);
    if (payload && Object.hasOwn(payload, 'shop_uuid')) candidates.push(payload.shop_uuid);
  }
  if (candidates.some(value => typeof value !== 'string' || !uuid.test(value))) {
    throw new Error('community_workspace_shop_invalid');
  }
  const identities = new Set(candidates.map(value => value.toLowerCase()));
  if (identities.size > 1) throw new Error('community_workspace_shop_conflict');
  return identities.values().next().value || null;
}
