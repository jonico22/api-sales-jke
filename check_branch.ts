import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkBranch() {
    const branchId = 'c5454462-289c-41be-9017-78ae60ce000d';
    console.log(`Checking for branch with ID: ${branchId}`);

    const branch = await prisma.branchOffice.findUnique({
        where: { id: branchId }
    });

    console.log('Found by ID:', branch);

    const allBranches = await prisma.branchOffice.findMany({
        select: { id: true, code: true, name: true, societyId: true }
    });
    console.log('\nAll Branch Offices:', allBranches);
}

checkBranch()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
