# 1. BASE
FROM node:22-bookworm-slim AS base
ENV TZ=America/Lima
RUN apt-get update && apt-get install -y --no-install-recommends tzdata openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 2. DEVELOPMENT (Aquí arreglamos el problema)
FROM base AS development
# --- CORRECCIÓN CRÍTICA ---
# Forzamos entorno de desarrollo para que npm install instale TypeScript
ENV NODE_ENV=development 
# --------------------------
COPY package*.json ./
# Install with exact versions from lockfile
RUN npm ci

# 2. Copy Prisma schema and generate (cached if schema doesn't change)
COPY prisma ./prisma/
RUN DATABASE_URL="postgresql://placeholder:5432/db" DIRECT_URL="postgresql://placeholder:5432/db" npx prisma generate

# 3. Copy ALL source code before build
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. BUILD
FROM development AS build
ARG SERVICE_URL_API
ARG SERVICE_FQDN_API
# Aquí volvemos a producción para el build
ENV NODE_ENV=production
# Aumentamos RAM
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build using npm script
RUN npm run build

RUN npm prune --production

# 4. PRODUCTION
FROM base AS production
ENV NODE_ENV=production
ENV TZ=America/Lima
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma

# 👇 AÑADE ESTA LÍNEA (Vital para que funcionen los alias @/)
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3800

# Create Uploads Directory
RUN mkdir -p /app/uploads/temp && chmod -R 777 /app/uploads

RUN echo "📂 CONTENIDO DE DIST:" && ls -R dist

CMD ["npm", "run", "start:prod-app"]