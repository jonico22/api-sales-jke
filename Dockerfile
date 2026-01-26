# 1. BASE: Herramientas del sistema e Infisical
FROM node:20-alpine AS base
# libc6-compat es esencial para que Prisma funcione en Alpine
RUN apk add --no-cache openssl bash curl python3 make g++ build-base libc6-compat
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash && \
    apk add --no-cache infisical
WORKDIR /app

# 2. DEVELOPMENT: Instalación y preparación
FROM base AS development
COPY package*.json ./
COPY prisma ./prisma/
# Instalamos TODO (incluyendo devDependencies para poder compilar)
RUN npm install
COPY . .
# Generamos Prisma aquí para que el entorno de dev local de Docker funcione
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. BUILD: Compilación a producción
FROM development AS build
# Argumentos que vienen de Coolify
ARG SERVICE_URL_API
ARG SERVICE_FQDN_API
# Convertimos ARGs en ENVs para que TSC los vea si los usas en el código
ENV SERVICE_URL_API=$SERVICE_URL_API
ENV SERVICE_FQDN_API=$SERVICE_FQDN_API
ENV NODE_ENV=production

# Forzamos la generación del cliente antes del build
RUN DATABASE_URL="postgresql://placeholder:5432/db" npx prisma generate

# Ejecutamos el build directamente. 
# Si falla aquí, los logs de Coolify ahora sí deberían mostrar los errores de TS.
RUN npm run build

# Eliminamos dependencias de desarrollo para aligerar la imagen
RUN npm prune --production

# 4. PRODUCTION: Imagen final limpia
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# Copiamos solo lo estrictamente necesario
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
# Importante: Copiamos los archivos generados de Prisma si usas el alias @generated
COPY --from=build /app/src/generated ./src/generated 

EXPOSE 3000

# Comando de arranque con Infisical corregido
CMD export INFISICAL_TOKEN=$(infisical login --method=universal-auth --client-id=$INFISICAL_CLIENT_ID --client-secret=$INFISICAL_CLIENT_SECRET --domain=${INFISICAL_API_URL:-https://app.infisical.com} --silent --plain) && \
    infisical run --token=$INFISICAL_TOKEN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PROJECT_PATH -- npm run start:prod-app