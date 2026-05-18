import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL!;
const useInsecureTls =
  databaseUrl.includes("sslmode=no-verify") || process.env.ALLOW_INSECURE_DB_TLS === "1";

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  ...(useInsecureTls ? { ssl: { rejectUnauthorized: false } } : {}),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding database...");

  // Create DayLockConfig singleton
  await prisma.dayLockConfig.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global", mode: "FREE", template: "A" },
  });
  console.log("✓ DayLockConfig created (FREE mode)");

  await prisma.emailConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      recipients: [],
      cc: [],
      reminderBody: "Bonjour {name}, il vous reste {pendingCount} tache(s) a completer pour {date}.",
      reportBody: "Rapport journalier du {date}.",
      monthlyReportBody: "Rapport mensuel de {monthLabel}.",
    },
  });
  console.log("✓ EmailConfig created");

  // Create admin user
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin1234";

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const hashed = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        name: "Administrateur",
        email: adminEmail,
        password: hashed,
        role: "ADMIN",
      },
    });
    console.log(`✓ Admin user created: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`ℹ Admin user already exists: ${adminEmail}`);
  }

  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
