import { prisma } from './prisma/prismaClient.js';

async function main() {
  try {
    const tenders = await prisma.tender.findMany();
    console.log(`Total tenders in database: ${tenders.length}`);
    const statuses = new Set();
    tenders.forEach(t => {
      statuses.add(t.currentStatus);
    });
    console.log("Database statuses:", Array.from(statuses));
  } catch (err) {
    console.error("Error connecting to database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
