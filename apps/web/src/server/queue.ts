import "server-only";
import { JobQueue } from "@modulon-poc/queue";

const clientVersion = 'dashboard-summary-v4';
const shared = globalThis as typeof globalThis & { modulonJobQueue?: JobQueue; modulonJobQueueVersion?: string };
/** Web may produce/read jobs; schema changes and consumption belong to setup/worker. */
export function getJobQueue() {
  if (shared.modulonJobQueue && shared.modulonJobQueueVersion === clientVersion) return shared.modulonJobQueue;
  if (shared.modulonJobQueue) {
    void shared.modulonJobQueue.stop().catch(() => console.error('Could not close outdated queue client'));
    shared.modulonJobQueue = undefined;
  }
  const connection = process.env.QUEUE_DATABASE_URL;
  if (!connection) throw new Error("QUEUE_DATABASE_URL is required");
  let valid = false;
  try {
    const queue = new URL(connection);
    const app = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
    valid = ["postgres:", "postgresql:"].includes(queue.protocol) && Boolean(queue.pathname.slice(1)) && (!app || queue.pathname !== app.pathname);
  } catch { /* Connection details stay private. */ }
  if (!valid) throw new Error("Queue requires its own PostgreSQL database");
  shared.modulonJobQueue = new JobQueue(connection);
  shared.modulonJobQueueVersion = clientVersion;
  return shared.modulonJobQueue;
}
