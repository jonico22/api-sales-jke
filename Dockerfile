# 1. BASE
FROM node:20-alpine AS base
ENV TZ=America/Lima
RUN apk add --no-cache openssl bash curl python3 make g++ build-base libc6-compat tzdata
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash && \
    apk add --no-cache infisical
WORKDIR /app

# 2. DEVELOPMENT (Aquí arreglamos el problema)
FROM base AS development
# --- CORRECCIÓN CRÍTICA ---
# Forzamos entorno de desarrollo para que npm install instale TypeScript
ENV NODE_ENV=development 
# --------------------------
COPY package*.json ./
# 1. Install dependencies first (cached if package.json doesn't change)
RUN npm install --verbose --legacy-peer-deps

# 2. Copy Prisma schema and generate (cached if schema doesn't change)
COPY prisma ./prisma/
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate

# 3. Copy source code last (cached if src doesn't change)
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

# Ejecutamos el diagnóstico. Ahora SÍ encontrará el binario de TSC.
RUN ./node_modules/.bin/tsc --project tsconfig.json --noEmit > error_log.txt 2>&1 || \
    (echo "🔥 INICIO DEL REPORTE DE ERRORES 🔥" && \
    cat error_log.txt && \
    echo "🔥 FIN DEL REPORTE DE ERRORES 🔥" && \
    exit 1)

# Si pasa el diagnóstico, compilamos de verdad
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
EXPOSE 4500

# Create Uploads Directory
RUN mkdir -p /app/uploads/temp && chmod -R 777 /app/uploads

RUN echo "📂 CONTENIDO DE DIST:" && ls -R dist

CMD export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id=$INFISICAL_CLIENT_ID --client-secret=$INFISICAL_CLIENT_SECRET --domain=${INFISICAL_API_URL:-https://app.infisical.com} --silent --plain) && \
    infisical run --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PROJECT_PATH -- npm run start:prod-app