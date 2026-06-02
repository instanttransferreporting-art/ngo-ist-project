import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL!;
  const useInsecureTls =
    databaseUrl.includes("sslmode=no-verify") || process.env.ALLOW_INSECURE_DB_TLS === "1";

  // In serverless (Vercel), each function instance has its own pool.
  // Limiting to max:1 prevents exhausting the Supabase session-mode pool (limit: 15).
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 1,
    ...(useInsecureTls ? { ssl: { rejectUnauthorized: false } } : {}),
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
