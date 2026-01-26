# 1. BASE: Herramientas del sistema
FROM node:20-alpine AS base
# Instalamos libc6-compat (necesario para Prisma) y herramientas de compilación
RUN apk add --no-cache openssl bash curl python3 make g++ build-base libc6-compat
# Instalamos Infisical
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash && \
    apk add --no-cache infisical
WORKDIR /app

# 2. DEVELOPMENT: Instalación
FROM base AS development
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
COPY . .
# Generamos Prisma con URL ficticia (para que no pida conexión en este paso)
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. BUILD: Compilación
FROM development AS build
ARG SERVICE_URL_API
ARG SERVICE_FQDN_API
ENV NODE_ENV=production

# Aumentamos memoria para el compilador por seguridad
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Ejecutamos el build usando tu script del package.json
# Usamos "||" para que si falla, nos muestre las últimas líneas del error
RUN npm run build || (echo "⬇️ ERROR DE COMPILACIÓN DETECTADO ⬇️" && npm run build > build.log 2>&1; tail -n 50 build.log && exit 1)

# Limpiamos dependencias de desarrollo
RUN npm prune --production

# 4. PRODUCTION: Imagen Final
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# Copiamos los archivos compilados
# NOTA: Tu código ahora vive en /app/dist/src/index.js
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

# Usamos tu script "start:prod-app" que ya tiene las rutas corregidas
CMD export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id=$INFISICAL_CLIENT_ID --client-secret=$INFISICAL_CLIENT_SECRET --domain=${INFISICAL_API_URL:-https://app.infisical.com} --silent --plain) && \
    infisical run --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PROJECT_PATH -- npm run start:prod-app