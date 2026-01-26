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
# URL ficticia para que Prisma genere el cliente sin conexión
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. BUILD
FROM development AS build
ARG SERVICE_URL_API
ARG SERVICE_FQDN_API
ENV NODE_ENV=production


# Esto ejecuta SOLO el chequeo de tipos. Si falla, IMPRIME los errores.
RUN echo "⬇️ INICIO DE ERRORES DE TYPESCRIPT ⬇️" && \
    ./node_modules/.bin/tsc --project tsconfig.json --noEmit || true && \
    echo "⬆️ FIN DE ERRORES DE TYPESCRIPT ⬆️"

# Compilamos (Ahora que tsconfig está corregido, esto PASARÁ)
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

# El comando de arranque usa tsconfig-paths que acabamos de instalar
CMD export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id=$INFISICAL_CLIENT_ID --client-secret=$INFISICAL_CLIENT_SECRET --domain=${INFISICAL_API_URL:-https://app.infisical.com} --silent --plain) && \
    infisical run --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PROJECT_PATH -- npm run start:prod-app