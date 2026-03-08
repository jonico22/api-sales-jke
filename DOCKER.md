# Configuración de Docker Compose - Desarrollo vs Producción

## 📋 Resumen

Este proyecto usa **múltiples archivos Docker Compose** para separar la configuración de desarrollo y producción.

## 🏗️ Arquitectura de archivos

### `docker-compose.yml` (Base - Producción)
- Configuración base que se usa en **producción**
- El código viene **empaquetado en la imagen Docker**
- No monta volúmenes de código fuente

### `docker-compose.override.yml` (Desarrollo)
- Se aplica **automáticamente** cuando ejecutas `docker-compose up` localmente
- Monta el código fuente para **hot-reload**
- Permite desarrollo en tiempo real

## 🚀 Comandos

### Desarrollo (con hot-reload)
```bash
# Usando npm scripts (RECOMENDADO)
npm run docker:dev

# O directamente con docker-compose
docker-compose --profile local-services up --build

# Detener servicios
npm run docker:down

# Limpiar volúmenes y contenedores
npm run docker:clean

# Reset completo (limpia y reinicia)
npm run docker:reset
```

### Producción
```bash
# Usando npm scripts (RECOMENDADO)
npm run docker:prod

# O directamente con docker-compose
docker-compose -f docker-compose.yml up --build api
```

## 🔍 ¿Cómo funciona?

Docker Compose automáticamente busca y aplica estos archivos en orden:
1. `docker-compose.yml` (base)
2. `docker-compose.override.yml` (si existe, se fusiona automáticamente)

### En desarrollo local:
- ✅ Ambos archivos existen
- ✅ Se montan volúmenes para hot-reload
- ✅ Cambios en código se reflejan inmediatamente

### En producción:
- ✅ Solo existe `docker-compose.yml`
- ✅ Código viene de la imagen Docker
- ✅ No hay volúmenes de código fuente
- ✅ Más seguro y predecible

## 📦 Volúmenes explicados

### Desarrollo (docker-compose.override.yml)
```yaml
volumes:
  - .:/app                        # Monta código local → hot-reload (vía nodemon polling)
  - /app/node_modules             # Preserva node_modules del contenedor
  - /app/src/generated/prisma     # Preserva archivos generados de Prisma
  - /app/node_modules/.prisma     # Preserva cliente Prisma generado
```

### Producción (docker-compose.yml)
```yaml
# Sin volúmenes de código
# El código viene del Dockerfile en la etapa 'production'
```

## ⚙️ Variables de entorno

### BUILD_TARGET
Controla qué etapa del Dockerfile usar:

```bash
# Desarrollo (con devDependencies)
BUILD_TARGET=development docker-compose up

# Producción (optimizado, sin devDependencies)
BUILD_TARGET=production docker-compose up
```

## 🎯 Mejores prácticas

### ✅ Hacer
- Usar `docker-compose up` en desarrollo
- Usar `docker-compose -f docker-compose.yml up` en producción
- Agregar `docker-compose.override.yml` al `.gitignore` si tiene configuraciones personales

### ❌ No hacer
- No montar código fuente (`.:/app`) en producción
- No usar el mismo archivo para desarrollo y producción
- No commitear configuraciones sensibles en override

## 🔒 Seguridad

El archivo `docker-compose.override.yml`:
- ✅ Está incluido en el repositorio para desarrollo estándar
- ⚠️ Si agregas secretos personales, añádelo a `.gitignore`
- ✅ No se usa en producción automáticamente

## 🔐 Gestión de secretos con Infisical

### Desarrollo
```bash
# Las variables se inyectan desde el host usando 'infisical run'
npm run docker:dev
# Ejecuta: infisical run --env=dev --path=/sales --cross-env ... docker-compose up
```

En desarrollo:
- ✅ `infisical run` inyecta las variables desde el **host**
- ✅ Las variables de Infisical del contenedor se **sobrescriben a vacío**
- ✅ No necesitas configurar `INFISICAL_CLIENT_ID` ni `INFISICAL_CLIENT_SECRET` en el contenedor
- ✅ New Relic está **deshabilitado** por defecto

### Producción
```bash
# Las variables se leen desde el contenedor
npm run docker:prod
```

En producción:
- ✅ El contenedor usa las variables de entorno del sistema
- ✅ Necesitas configurar `INFISICAL_CLIENT_ID` y `INFISICAL_CLIENT_SECRET`
- ✅ La aplicación dentro del contenedor se conecta a Infisical
- ✅ New Relic está **habilitado** (si configuras las credenciales)

### Variables de Infisical

| Variable | Desarrollo | Producción |
|----------|------------|------------|
| `INFISICAL_MACHINE_IDENTITY_CLIENT_ID` | Vacía (usa host) | Requerida |
| `INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET` | Vacía (usa host) | Requerida |
| `INFISICAL_ENV` | Vacía (usa host) | Requerida |
| `INFISICAL_PROJECT_PATH` | Vacía (usa host) | Requerida |
| `NEW_RELIC_ENABLED` | `false` | `true` (default) |

## 📝 Notas adicionales

- Los servicios `db` y `redis` usan el profile `local-services`
- Solo se inician si usas `--profile local-services`
- En producción, probablemente uses bases de datos administradas (RDS, etc.)

const legalInfo = await prisma.bussinessPartner.create({
  data: {
    typeBP: 'COMPANY',
    companyName: 'My Awesome Company S.A.C.',
    documentNumber: '20123456789',
    // ...
    // Link it to the society
    societyRepresented: {
       connect: { id: societyId }
    }
  }
})