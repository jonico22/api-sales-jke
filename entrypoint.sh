#!/bin/sh

# Si estamos en desarrollo
if [ "$NODE_ENV" = "development" ]; then
  echo "🛠️ Ejecutando en modo DESARROLLO"
  npx prisma migrate dev --name init
  npm run dev
else
  # Si estamos en producción (por defecto)
  echo "🚀 Ejecutando en modo PRODUCCIÓN"
  npx prisma migrate deploy
  node dist/index.js
fi