
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSociety() {
    const code = 'SOC-MLE755RH9PH';
    console.log(`Checking for society with code: ${code}`);

    const society = await prisma.society.findFirst({
        where: {
            code: { equals: code, mode: 'insensitive' }
        }
    });

    console.log('Found:', society);

    const all = await prisma.society.findMany({ select: { code: true } });
    console.log('All Society Codes:', all.map(s => s.code));
}

checkSociety()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
