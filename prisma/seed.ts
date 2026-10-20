import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";

const CATEGORIES = [
  { name: "E-book", color: "#6366f1" },
  { name: "Publishing", color: "#10b981" },
  { name: "Cover Design", color: "#f59e0b" },
];

async function main() {
  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in .env");

  const workspace = await prisma.workspace.upsert({
    where: { slug: "tfg" },
    update: {},
    create: { name: "TFG Solutions", slug: "tfg" },
  });

  const owner = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Owner", passwordHash: await bcrypt.hash(password, 10) },
  });

  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" },
  });

  if ((await prisma.category.count({ where: { workspaceId: workspace.id } })) === 0) {
    await prisma.channel.create({ data: { workspaceId: workspace.id, name: "General" } });
    for (const [position, c] of CATEGORIES.entries()) {
      const category = await prisma.category.create({ data: { ...c, position, workspaceId: workspace.id } });
      await prisma.channel.create({ data: { workspaceId: workspace.id, name: c.name, categoryId: category.id } });
    }
  }

  console.log(`Seeded workspace "${workspace.name}" with owner ${email}`);
}

main().finally(() => prisma.$disconnect());
