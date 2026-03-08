# 📋 Referencia Rápida de Scripts NPM

## Scripts de Docker

| Script | Comando | Descripción | Cuándo usar |
|--------|---------|-------------|-------------|
| `npm run docker:dev` | `cross-env NODE_ENV=development BUILD_TARGET=development docker-compose --profile local-services up --build` | Inicia en modo desarrollo con DB y Redis locales | **Desarrollo local** con hot-reload |
| `npm run docker:prod` | `docker-compose -f docker-compose.yml up --build api` | Inicia solo la API en modo producción | **Testing de producción** localmente |
| `npm run docker:down` | `docker-compose --profile local-services down` | Detiene todos los contenedores | Cuando terminas de trabajar |
| `npm run docker:clean` | `docker-compose --profile local-services down -v --remove-orphans` | Limpia contenedores y volúmenes | Cuando hay problemas o quieres empezar limpio |
| `npm run docker:reset` | `npm run docker:clean && npm run docker:dev` | Limpia todo y reinicia en modo dev | Cuando necesitas un reset completo |

## Scripts de Desarrollo (sin Docker)

| Script | Comando | Descripción |
|--------|---------|-------------|
| `npm run dev` | `npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed && tsx watch src/index.ts` | Desarrollo local sin Docker |
| `npm run dev:native` | `node --env-file=.env -r tsx src/index.ts` | Desarrollo nativo con Node |

## Scripts de Prisma

| Script | Comando | Descripción |
|--------|---------|-------------|
| `npm run prisma:generate` | `npx prisma generate` | Genera el cliente de Prisma |
| `npm run prisma:migrate` | `npx prisma migrate dev --name init --skip-generate` | Ejecuta migraciones |
| `npm run prisma:studio` | `npx prisma studio` | Abre Prisma Studio |
| `npm run prisma:seed` | `npx tsx prisma/seed.ts` | Ejecuta el seed de la BD |

## Scripts de Producción

| Script | Comando | Descripción |
|--------|---------|-------------|
| `npm run build` | `tsc && tsc-alias && npx prisma generate` | Compila TypeScript y genera Prisma |
| `npm start` | `node dist/index.js` | Inicia la app compilada |
| `npm run start:prod` | `npx prisma migrate deploy && npm run prisma:seed && node dist/index.js` | Inicia en producción con migraciones |

## 🎯 Flujos de trabajo comunes

### Desarrollo diario
```bash
# Iniciar
npm run docker:dev

# Trabajar en tu código (hot-reload automático)

# Detener al terminar
npm run docker:down
```

### Problemas con la base de datos
```bash
# Reset completo
npm run docker:reset
```

### Testing de producción local
```bash
# Primero construye la imagen
npm run build

# Luego inicia en modo producción
npm run docker:prod
```

### Ver la base de datos
```bash
# Con Docker corriendo
npm run prisma:studio
```

## 🔍 Variables de entorno importantes

### NODE_ENV
- `development` → Modo desarrollo (con devDependencies)
- `production` → Modo producción (optimizado)

### BUILD_TARGET
- `development` → Usa etapa de desarrollo del Dockerfile
- `production` → Usa etapa de producción del Dockerfile (default)

## ⚙️ Diferencias clave: docker:dev vs docker:prod

| Aspecto | `docker:dev` | `docker:prod` |
|---------|--------------|---------------|
| **Volúmenes** | ✅ Monta código local (hot-reload) | ❌ Código empaquetado en imagen |
| **NODE_ENV** | `development` | `production` |
| **BUILD_TARGET** | `development` | `production` |
| **Servicios** | API + DB + Redis | Solo API |
| **DevDependencies** | ✅ Incluidas | ❌ No incluidas |
| **Optimización** | Menos optimizado, más rápido para desarrollar | Optimizado para producción |
| **Archivo usado** | `docker-compose.yml` + `docker-compose.override.yml` | Solo `docker-compose.yml` |
