// Promote an existing user to workspace admin (role = ADMIN), enabling the admin panel.
// Run from the server workspace: `node scripts/make-admin.mjs user@example.com`
import { PrismaClient } from '@prisma/client';

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error('Usage: node scripts/make-admin.mjs <email>');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' },
    select: { id: true, email: true, role: true },
  });
  console.log(`✓ ${user.email} is now ${user.role}`);
} catch (err) {
  if (err?.code === 'P2025') {
    console.error(`✗ No user found with email ${email}`);
  } else {
    console.error(err);
  }
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
