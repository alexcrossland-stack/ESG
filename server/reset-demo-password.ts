import bcrypt from "bcryptjs";
import { db } from "./storage";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "test1234!";

async function resetDemoPassword() {
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);
  const result = await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.email, DEMO_EMAIL))
    .returning({ id: users.id, email: users.email });

  if (result.length === 0) {
    console.error(`No user found with email: ${DEMO_EMAIL}`);
    process.exit(1);
  }

  console.log(`Password reset for ${result[0].email} (id: ${result[0].id})`);
}

resetDemoPassword()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error resetting demo password:", err);
    process.exit(1);
  });
