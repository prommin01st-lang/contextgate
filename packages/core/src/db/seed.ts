import { pool, db } from "./client";
import { workspaces, users, connectors } from "./schema";

async function seed() {
  console.log("🌱 Seeding database...");

  // 1. Default workspace
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: "Default",
      slug: "default",
      settings: {},
    })
    .onConflictDoNothing({ target: workspaces.slug })
    .returning();

  const workspaceId = workspace?.id;

  if (workspaceId) {
    console.log("✅ Workspace created:", workspaceId);
  } else {
    console.log("ℹ️ Workspace 'default' already exists");
  }

  // 2. Admin user
  const passwordHash = "hashed-admin123-placeholder"; // dev-only placeholder
  const [user] = await db
    .insert(users)
    .values({
      email: "admin@contextgate.local",
      passwordHash,
      name: "Admin",
      role: "admin",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (user?.id) {
    console.log("✅ Admin user created:", user.id);
  } else {
    console.log("ℹ️ Admin user already exists");
  }

  // 3. Sample filesystem connector (requires workspace)
  if (workspaceId) {
    const [connector] = await db
      .insert(connectors)
      .values({
        workspaceId,
        type: "filesystem",
        name: "Filesystem Local",
        config: { basePath: "/tmp" },
        isActive: true,
        readOnly: true,
      })
      .onConflictDoNothing()
      .returning();

    if (connector?.id) {
      console.log("✅ Connector created:", connector.id);
    } else {
      console.log("ℹ️ Sample connector already exists");
    }
  }

  console.log("🎉 Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
