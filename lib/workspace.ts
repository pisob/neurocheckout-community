import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { authenticatedCloudFetch } from "@/lib/authenticated-cloud-fetch";
import { cloudApiBaseUrl, communityClientId, sessionSecret } from "@/lib/config";
import { workspaceStoreDirectory, saveWorkspaceGrants, type WorkspaceGrant } from "@/scripts/workspace-store.mjs";
import { saveRelayCredential } from "@/scripts/server-data-relay.mjs";
import { saveAvailabilityCredential } from "@/scripts/server-availability.mjs";
import { version } from "@/package.json";
import { loadLocalDataConfig } from "@/scripts/local-data-store.mjs";

export function workspaceRoot() {
  return process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state");
}

export async function authorizedWorkspaceDirectory(request: NextRequest, shopUuid: string) {
  const response = await authenticatedCloudFetch(request, "/api/v1/member/community-auth/workspace");
  if (response.status === 404) {
    // Compatibility with a Cloud not yet offering workspaces: authorize the
    // legacy vault using its one bound shop. Never fall back for another shop.
    const shopsResponse = await authenticatedCloudFetch(request, "/api/v1/member/shops");
    if (!shopsResponse.ok) return { response: shopsResponse, directory: null };
    const shops = (await shopsResponse.clone().json()).items;
    if (Array.isArray(shops) && shops.length === 1 &&
        String(shops[0].shop_uuid || shops[0].canonical_shop_id || shops[0].id) === shopUuid &&
        loadLocalDataConfig(workspaceRoot()).shopId === shops[0].shop_id) {
      return { response: shopsResponse, directory: workspaceRoot() };
    }
  }
  if (!response.ok) return { response, directory: null };
  const payload = await response.clone().json() as { items?: WorkspaceGrant[] };
  saveWorkspaceGrants(workspaceRoot(), payload.items || []);
  const matches = payload.items?.filter(grant => grant.shop_uuid === shopUuid) || [];
  if (matches.length !== 1) {
    const denied = new Response(JSON.stringify({ detail: "workspace_shop_not_authorized" }), {
      status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) denied.headers.set("set-cookie", cookie);
    return { response: denied, directory: null };
  }
  try { return { response, directory: workspaceStoreDirectory(workspaceRoot(), matches[0]) }; }
  catch {
    const unavailable = new Response(JSON.stringify({ detail: "workspace_local_setup_required" }), {
      status: 409, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) unavailable.headers.set("set-cookie", cookie);
    return { response: unavailable, directory: null };
  }
}

export async function bootstrapWorkspaceDirectory(request: NextRequest, shopUuid: string) {
  const current = await authorizedWorkspaceDirectory(request, shopUuid);
  // The primary credential is already managed by OAuth refresh. Do not rotate
  // it from a competing setup request or touch the legacy WooCommerce vault.
  if (current.directory === workspaceRoot()) return current;
  if (!current.directory && current.response.status !== 409) return current;
  const response = await authenticatedCloudFetch(request, "/api/v1/member/community-auth/workspace/bootstrap", {
    method: "POST", body: JSON.stringify({ target_shop_uuid: shopUuid }),
  });
  if (!response.ok) return { response, directory: null };
  const payload = await response.json() as {
    grant: WorkspaceGrant; availability_token: string;
    local_data_credential: { token: string; installation_id: string; shop_id: string };
  };
  if (payload.grant?.shop_uuid !== shopUuid || payload.local_data_credential?.installation_id !== payload.grant.installation_id ||
      payload.local_data_credential?.shop_id !== payload.grant.shop_id) throw new Error("workspace_response_invalid");
  const directory = workspaceStoreDirectory(workspaceRoot(), payload.grant, { create: true });
  const options = { enabled: true, environment: "staging", directory,
    secret: sessionSecret(), cloudUrl: cloudApiBaseUrl(), clientId: communityClientId(),
    port: process.env.PORT || "3400", version };
  await saveRelayCredential(options, payload.local_data_credential);
  await saveAvailabilityCredential({ ...options, token: payload.availability_token });
  return { response, directory };
}
