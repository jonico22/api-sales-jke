# 1. BASE: Instalación de dependencias comunes
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
# Instalamos todas las dependencias (incluyendo devDependencies para compilar)
RUN npm install
# Generamos el cliente de Prisma aquí para que esté disponible en todas las etapas
RUN npx prisma generate

# 2. DEVELOPMENT: Etapa para programar (Hot Reload)
FROM base AS development
# Copiamos el resto del código
COPY . .
# El comando se define en el docker-compose o entrypoint
CMD ["npm", "run", "dev"]

# 3. BUILD: Compilación de TypeScript a JavaScript
FROM base AS build
COPY . .
RUN npm run build
# Eliminamos dependencias de desarrollo para que la imagen final sea ligera
RUN npm prune --production

# 4. PRODUCTION: La etapa que tú compartiste, optimizada
FROM node:20-alpine AS production
WORKDIR /app

# Definimos variables de entorno por defecto
ENV NODE_ENV=production

# Copiamos solo lo estrictamente necesario de las etapas anteriores
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/entrypoint.sh ./

# Permisos para el entrypoint
RUN chmod +x entrypoint.sh

EXPOSE 3000

# El script decide si hace 'migrate deploy' o 'migrate dev'
ENTRYPOINT ["./entrypoint.sh"]