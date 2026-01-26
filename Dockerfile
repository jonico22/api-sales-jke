# 1. BASE: Herramientas del sistema e Infisical (Común para todo)
FROM node:20-alpine AS base
RUN apk add --no-cache openssl bash curl python3 make g++ build-base libc6-compat
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash && \
    apk add --no-cache infisical
WORKDIR /app

ARG INFISICAL_CLIENT_ID
ARG INFISICAL_CLIENT_SECRET
ARG INFISICAL_ENV
ARG INFISICAL_PROJECT_PATH
ARG INFISICAL_PROJECT_ID

# ... (dentro de tu etapa de build)
ARG SERVICE_URL_API
ARG SERVICE_FQDN_API
# Esto hace que el valor esté disponible para el código Node durante el build
ENV SERVICE_URL_API=$SERVICE_URL_API
ENV SERVICE_FQDN_API=$SERVICE_FQDN_API

# 2. DEVELOPMENT: Aquí es donde fallaba
FROM base AS development
# Copiamos todo el proyecto primero para evitar errores de scripts (postinstall)
COPY . .
# Instalamos todas las dependencias
RUN npm install
# Generamos el cliente de Prisma (usando el schema que ya se copió en el paso anterior)
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. BUILD: Compilación de la app
FROM development AS build

# --- PASO DE DIAGNÓSTICO ---
RUN ls -R prisma/ && echo "Ubicación actual: $(pwd)"
# Prisma a veces se queja si no ve una variable DATABASE_URL aunque sea falsa
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db" npx prisma generate
RUN ls -la && ls -R src | head -n 20
RUN npx tsc --project tsconfig.json --pretty false > /tmp/errors.txt 2>&1 || (cat /tmp/errors.txt && exit 1)
RUN npm run build
# Limpiamos dependencias de desarrollo para la imagen final
RUN npm prune --production

# 4. PRODUCTION: Imagen final optimizada
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# Copiamos solo lo necesario desde la etapa de build
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
# Ajusta esta ruta si tu cliente de Prisma se genera en otro lugar
COPY --from=build /app/src/generated ./src/generated 

EXPOSE 3000

# Comando de arranque con Infisical para producción
CMD export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id=$INFISICAL_CLIENT_ID --client-secret=$INFISICAL_CLIENT_SECRET --domain=${INFISICAL_API_URL:-https://app.infisical.com} --silent --plain) && \
    infisical run --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PROJECT_PATH -- npm run start:prod-app