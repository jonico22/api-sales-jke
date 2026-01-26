# 1. BASE
FROM node:20-alpine AS base
RUN apk add --no-cache openssl bash curl python3 make g++ build-base libc6-compat
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash && \
    apk add --no-cache infisical
WORKDIR /app

# 2. DEVELOPMENT
FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
# Generamos Prisma en la ruta estándar (node_modules/.prisma)
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. BUILD
FROM development AS build
ARG SERVICE_URL_API
ARG SERVICE_FQDN_API
ENV SERVICE_URL_API=$SERVICE_URL_API
ENV SERVICE_FQDN_API=$SERVICE_FQDN_API
ENV NODE_ENV=production

# Ejecutamos el build. Al estar en node_modules, tsc encontrará los tipos de Prisma automáticamente
RUN npm run build
# IMPORTANTE: No hacemos prune todavía para no perder el generador si el seed lo necesita
RUN npm prune --production

# 4. PRODUCTION
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# Copiamos dist y los node_modules que ya tienen el cliente de Prisma generado
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

CMD export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id=$INFISICAL_CLIENT_ID --client-secret=$INFISICAL_CLIENT_SECRET --domain=${INFISICAL_API_URL:-https://app.infisical.com} --silent --plain) && \
    infisical run --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PROJECT_PATH -- npm run start:prod-app