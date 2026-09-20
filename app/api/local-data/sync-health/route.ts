import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

import { requestDataRelayRun } from "@/lib/server-data-relay";
import { requestSourcePullRun } from "@/lib/server-source-pull";
import { automaticSourceStatus } from "@/scripts/automatic-source-setup.mjs";
import { EmailArchive } from "@/scripts/email-archive.mjs";
import { LocalDataStore } from "@/scripts/local-data-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function directory(): string {
  return process.env.NC_COMMUNITY_STATE_DIRECTORY || resolve(process.cwd(), ".community-state");
}

function unavailable() {
  return NextResponse.json({ available: false, configured: false, ready: false }, {
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function GET() {
  if (process.env.NC_DEPLOYMENT_ENV !== "staging" || process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true" ||
      !existsSync(resolve(directory(), "local-data-keys.json"))) return unavailable();
  let store: LocalDataStore | undefined;
  let archive: EmailArchive | undefined;
  try {
    const source = automaticSourceStatus(directory());
    store = new LocalDataStore(directory());
    const queue = store.db.prepare(`SELECT COUNT(*) AS pending,
      MIN(observed_at) AS oldest_at, MAX(observed_at) AS newest_at FROM outbox`).get() as Record<string, number | null>;
    const records = store.db.prepare(`SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE kind='cart') AS carts,
      COUNT(*) FILTER (WHERE kind='product') AS products FROM records`).get() as Record<string, number>;
    archive = new EmailArchive(directory());
    const copies = archive.db.prepare(`SELECT COUNT(*) AS confirmed,
      MAX(sent_at) AS last_sent_at FROM email_archive WHERE sent_at IS NOT NULL`).get() as Record<string, number | null>;
    return NextResponse.json({
      available: true,
      configured: source.configured,
      ready: source.ready,
      shop_id: store.config.shopId,
      source: {
        last_success_at: source.lastSuccessAt || null,
        last_complete_at: source.lastCompleteAt || null,
        records: Number(records.total || 0),
        carts: Number(records.carts || 0),
        products: Number(records.products || 0),
      },
      outbox: {
        pending: Number(queue.pending || 0),
        oldest_at: queue.oldest_at || null,
        newest_at: queue.newest_at || null,
      },
      archive: {
        confirmed: Number(copies.confirmed || 0),
        last_sent_at: copies.last_sent_at || null,
        encrypted: true,
      },
      generated_at: Date.now(),
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ available: true, configured: false, ready: false, detail: "sync_health_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, private" },
    });
  } finally {
    archive?.close();
    store?.close();
  }
}

export async function POST() {
  if (process.env.NC_DEPLOYMENT_ENV !== "staging" || process.env.NC_LOCAL_DATA_PILOT_ENABLED !== "true") {
    return NextResponse.json({ detail: "local_data_unavailable" }, { status: 404 });
  }
  const sourceScheduled = requestSourcePullRun();
  const relayScheduled = requestDataRelayRun();
  return NextResponse.json({
    status: sourceScheduled || relayScheduled ? "scheduled" : "unavailable",
    source_scheduled: sourceScheduled,
    relay_scheduled: relayScheduled,
  }, {
    status: sourceScheduled || relayScheduled ? 202 : 503,
    headers: { "Cache-Control": "no-store, private" },
  });
}
