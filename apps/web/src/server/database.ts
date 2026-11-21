import "server-only";
import { createDatabaseClient, type PrismaClient } from "@modulon-poc/database";

// Bump with generated schema changes that invalidate the DEV HMR singleton.
const schemaVersion = "udip-transcriptions-v13";
const databaseGlobal = globalThis as typeof globalThis & { modulonDatabase?: PrismaClient; modulonDatabaseSchema?: string };
let database: PrismaClient | undefined;

/** Lazy initialization keeps builds and non-database routes independent of PostgreSQL. */
export function getDatabase(): PrismaClient {
  if (database) return database;
  if (process.env.NODE_ENV !== "production" && databaseGlobal.modulonDatabase) {
    const cached = databaseGlobal.modulonDatabase;
    if (cached.product && databaseGlobal.modulonDatabaseSchema === schemaVersion) {
      database = cached;
      return database;
    }
    databaseGlobal.modulonDatabase = undefined;
    void cached.$disconnect().catch(() => console.error("Could not close outdated DEV database client"));
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for database access");
  database = createDatabaseClient({ connectionString });
  if (process.env.NODE_ENV !== "production") {
    databaseGlobal.modulonDatabase = database;
    databaseGlobal.modulonDatabaseSchema = schemaVersion;
  }
  return database;
}
