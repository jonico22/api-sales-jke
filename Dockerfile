# 1. BASE: Instalación de dependencias y librerías de sistema
FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

# 2. DEVELOPMENT: Etapa para programar con Hot Reload
FROM base AS development
# Instalamos todas las dependencias (incluye devDependencies)
RUN npm install
COPY . .
# Generación de cliente (con URL ficticia) para que TS no de errores en el build
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

EXPOSE 3000
# El control ahora es 100% de NPM
CMD ["npm", "run", "dev"]

# 3. BUILD: Compilación de TS a JS
FROM development AS build
RUN npm run build
RUN npm prune --production

# 4. PRODUCTION: Imagen ligera
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/generated ./src/generated

EXPOSE 3000
# En producción no solemos migrar automáticamente por seguridad, 
# pero puedes usar un script de npm si lo prefieres.
CMD ["npm", "run", "start:prod"]