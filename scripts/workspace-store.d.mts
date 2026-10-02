export type WorkspaceGrant = { shop_uuid: string; shop_id: string; installation_id: string; platform?: string };
export function workspaceStoreDirectory(root: string, grant: WorkspaceGrant, options?: { create?: boolean }): string;
export function workspaceChildDirectories(root: string): string[];
export function saveWorkspaceGrants(root: string, grants: WorkspaceGrant[]): void;
