import { localDataRequest } from "@/lib/local-data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return localDataRequest(request, "read"); }
