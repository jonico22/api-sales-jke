// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const env = process.env.NODE_ENV || 'development';
  console.log(`🌱 Iniciando seeding en modo: [${env.toUpperCase()}]`);

  const fileName = env === 'production' ? 'seed.prod.sql' : 'seed.sql';
  const filePath = path.join(__dirname, fileName);

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Archivo ${fileName} no encontrado.`);
    return;
  }

  // 1. Leer y limpiar el archivo SQL
  const fullSql = fs.readFileSync(filePath, 'utf8');
  
  // 2. Dividir por punto y coma, filtrar líneas vacías o comentarios
  const sqlStatements = fullSql
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);

  // 3. Ejecutar en una transacción para que sea "todo o nada"
  try {
    await prisma.$transaction(async (tx: any) => {
      console.log(`🚀 Ejecutando ${sqlStatements.length} sentencias desde ${fileName}...`);
      
      for (const sql of sqlStatements) {
        await tx.$executeRawUnsafe(sql);
      }
    });
    console.log('✅ Seeding completado con éxito.');
  } catch (error) {
    console.error('❌ Error crítico durante el seeding:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();