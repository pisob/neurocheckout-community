export function handleLocalData(request: Request, role: "read" | "write", options: {
  directory: string; enabled: boolean; environment: string;
}): Promise<Response>;
