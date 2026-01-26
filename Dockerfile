# 1. BASE
FROM node:20-alpine AS base
RUN apk add --no-cache openssl bash curl python3 make g++ build-base libc6-compat
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash && \
    apk add --no-cache infisical
WORKDIR /app

# 2. DEVELOPMENT
FROM base AS development
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
COPY . .
# Placeholder para generar cliente en dev
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate

# 3. BUILD (Aquí está la magia)
FROM development AS build
ARG SERVICE_URL_API
ARG SERVICE_FQDN_API
ENV NODE_ENV=production
# Aumentamos memoria al máximo
ENV NODE_OPTIONS="--max-old-space-size=4096"

# ---------------------------------------------------------
# DIAGNÓSTICO DE ERRORES:
# Ejecutamos tsc directamente. Si falla, imprimirá la lista de errores.
# El 'exit 1' asegura que el deploy se detenga aquí si hay fallos.
# ---------------------------------------------------------
RUN ./node_modules/.bin/tsc --project tsconfig.json --noEmit || exit 1

# Si pasamos la línea anterior, es seguro compilar
RUN npm run build
RUN npm prune --production

# 4. PRODUCTION
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

CMD export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id=$INFISICAL_CLIENT_ID --client-secret=$INFISICAL_CLIENT_SECRET --domain=${INFISICAL_API_URL:-https://app.infisical.com} --silent --plain) && \
    infisical run --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PROJECT_PATH -- npm run start:prod-app