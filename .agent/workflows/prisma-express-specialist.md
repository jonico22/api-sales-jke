---
description: Agente especialista en Prisma, PostgreSQL, Redis y Express.js con TypeScript para el proyecto api-sales-jke
---

# 🧠 Agente Especialista: Prisma + PostgreSQL + Redis + Express.js (TypeScript)

Este workflow te convierte en un especialista para desarrollar módulos en este proyecto siguiendo las mejores prácticas y patrones establecidos.

---

## 📋 Contexto del Proyecto

- **Framework**: Express.js 5.x con TypeScript
- **ORM**: Prisma 6.x
- **Base de Datos**: PostgreSQL
- **Cache**: Redis (node-redis 5.x)
- **Validación**: Zod 4.x
- **Documentación API**: Swagger + Zod-to-OpenAPI
- **Estructura**: Arquitectura modular por dominio

---

## 🗂️ Estructura de Directorios

```
src/
├── config/
│   ├── prisma.ts       # Cliente Prisma singleton
│   └── swagger.ts      # Configuración OpenAPI
├── module/
│   └── customer/
│       └── [modulo]/
│           ├── [modulo].controller.ts   # Controladores HTTP
│           ├── [modulo].service.ts      # Lógica de negocio + Prisma
│           ├── [modulo].validation.ts   # Esquemas Zod
│           └── [modulo].routes.ts       # Rutas Express (si existe)
├── routes/
│   └── index.ts        # Router principal
└── utils/              # Utilidades compartidas
```

---

## 🛠️ Crear un Nuevo Módulo CRUD

### Paso 1: Definir el Modelo en Prisma

Edita `prisma/schema.prisma`:

```prisma
model NuevoModelo {
  id          String   @id @default(uuid())
  nombre      String
  descripcion String?
  societyId   String
  society     Society  @relation(fields: [societyId], references: [id])
  
  isActive    Boolean  @default(true)
  isDeleted   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?
  updatedBy   String?
}
```

### Paso 2: Generar Cliente Prisma

// turbo
```bash
npx prisma generate
```

### Paso 3: Ejecutar Migración

```bash
npx prisma migrate dev --name add_nuevo_modelo
```

---

## 📝 Plantillas de Código

### 3.1 Validation (con Zod)

```typescript
// src/module/customer/nuevoModelo/nuevoModelo.validation.ts
import { z } from 'zod';

export const createNuevoModeloSchema = z.object({
  nombre: z.string().min(1, 'Nombre es requerido'),
  descripcion: z.string().optional(),
  societyId: z.string().uuid('Society ID inválido'),
  createdBy: z.string().uuid().optional(),
});

export const updateNuevoModeloSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  updatedBy: z.string().uuid().optional(),
});

export const nuevoModeloIdSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

// Tipos inferidos para usar en servicios
export type CreateNuevoModeloInput = z.infer<typeof createNuevoModeloSchema>;
export type UpdateNuevoModeloInput = z.infer<typeof updateNuevoModeloSchema>;
```

### 3.2 Service (Lógica de Negocio + Prisma)

```typescript
// src/module/customer/nuevoModelo/nuevoModelo.service.ts
import prisma from '@/config/prisma';
import { CreateNuevoModeloInput, UpdateNuevoModeloInput } from './nuevoModelo.validation';

export const create = async (data: CreateNuevoModeloInput) => {
  return prisma.nuevoModelo.create({ data });
};

export const findAll = async (societyId?: string) => {
  return prisma.nuevoModelo.findMany({
    where: {
      isDeleted: false,
      ...(societyId && { societyId }),
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const findById = async (id: string) => {
  return prisma.nuevoModelo.findUnique({
    where: { id },
  });
};

export const update = async (id: string, data: UpdateNuevoModeloInput) => {
  return prisma.nuevoModelo.update({
    where: { id },
    data,
  });
};

export const softDelete = async (id: string, updatedBy?: string) => {
  return prisma.nuevoModelo.update({
    where: { id },
    data: {
      isDeleted: true,
      isActive: false,
      updatedBy,
    },
  });
};

export const hardDelete = async (id: string) => {
  return prisma.nuevoModelo.delete({ where: { id } });
};
```

### 3.3 Controller (Manejo de Requests)

```typescript
// src/module/customer/nuevoModelo/nuevoModelo.controller.ts
import { Request, Response } from 'express';
import * as service from './nuevoModelo.service';
import {
  createNuevoModeloSchema,
  updateNuevoModeloSchema,
  nuevoModeloIdSchema,
} from './nuevoModelo.validation';

export const create = async (req: Request, res: Response) => {
  const parse = createNuevoModeloSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json(parse.error.format());

  const created = await service.create(parse.data);
  res.status(201).json(created);
};

export const findAll = async (req: Request, res: Response) => {
  const societyId = req.query.societyId as string | undefined;
  const items = await service.findAll(societyId);
  res.json(items);
};

export const findOne = async (req: Request, res: Response) => {
  const parse = nuevoModeloIdSchema.safeParse(req.params);
  if (!parse.success) return res.status(400).json(parse.error.format());

  const item = await service.findById(parse.data.id);
  if (!item) return res.status(404).json({ message: 'No encontrado' });
  res.json(item);
};

export const update = async (req: Request, res: Response) => {
  const idParse = nuevoModeloIdSchema.safeParse(req.params);
  const bodyParse = updateNuevoModeloSchema.safeParse(req.body);

  if (!idParse.success || !bodyParse.success) {
    return res.status(400).json({
      ...(idParse.error?.format?.() ?? {}),
      ...(bodyParse.error?.format?.() ?? {}),
    });
  }

  const updated = await service.update(idParse.data.id, bodyParse.data);
  res.json(updated);
};

export const remove = async (req: Request, res: Response) => {
  const parse = nuevoModeloIdSchema.safeParse(req.params);
  if (!parse.success) return res.status(400).json(parse.error.format());

  await service.softDelete(parse.data.id, req.body?.updatedBy);
  res.status(204).send();
};
```

---

## 🔧 Patrones Avanzados de Prisma

### Transacciones

```typescript
import prisma from '@/config/prisma';

export const createWithRelations = async (data: CreateOrderInput) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { ...data, orderItems: undefined },
    });

    await tx.orderItem.createMany({
      data: data.orderItems.map((item) => ({
        ...item,
        orderId: order.id,
      })),
    });

    return tx.order.findUnique({
      where: { id: order.id },
      include: { orderItems: true },
    });
  });
};
```

### Consultas con Relaciones (Include)

```typescript
export const findWithRelations = async (id: string) => {
  return prisma.order.findUnique({
    where: { id },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
      partner: true,
      branch: true,
    },
  });
};
```

### Paginación

```typescript
export const findPaginated = async (page = 1, limit = 10, societyId?: string) => {
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.product.findMany({
      where: { isDeleted: false, ...(societyId && { societyId }) },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({
      where: { isDeleted: false, ...(societyId && { societyId }) },
    }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
```

### Filtros Dinámicos

```typescript
import { Prisma } from '@prisma/client';

interface ProductFilters {
  search?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  isActive?: boolean;
}

export const findWithFilters = async (filters: ProductFilters) => {
  const where: Prisma.ProductWhereInput = {
    isDeleted: false,
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
    ...(filters.categoryId && { categoryId: filters.categoryId }),
    ...(filters.minPrice && { price: { gte: filters.minPrice } }),
    ...(filters.maxPrice && { price: { lte: filters.maxPrice } }),
    ...(filters.isActive !== undefined && { isActive: filters.isActive }),
  };

  return prisma.product.findMany({ where });
};
```

---

## 🗃️ Comandos Prisma Frecuentes

// turbo-all

### Ver estructura actual de la base de datos
```bash
npx prisma db pull
```

### Generar cliente después de cambios en schema
```bash
npx prisma generate
```

### Crear migración nueva
```bash
npx prisma migrate dev --name descripcion_del_cambio
```

### Aplicar migraciones en producción
```bash
npx prisma migrate deploy
```

### Abrir Prisma Studio (GUI)
```bash
npx prisma studio
```

### Resetear base de datos (⚠️ ELIMINA DATOS)
```bash
npx prisma migrate reset
```

### Ejecutar seed
```bash
npx tsx prisma/seed.ts
```

---

## 📊 Tipos Útiles de Prisma

```typescript
import { Prisma } from '@prisma/client';

// Tipo de entrada para crear
type ProductCreateInput = Prisma.ProductCreateInput;

// Tipo de entrada para actualizar
type ProductUpdateInput = Prisma.ProductUpdateInput;

// Tipo del modelo completo
type Product = Prisma.ProductGetPayload<{}>;

// Tipo con relaciones incluidas
type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    orderItems: {
      include: { product: true };
    };
  };
}>;

// Where conditions type
type ProductWhereInput = Prisma.ProductWhereInput;
```

---

## ⚠️ Errores Comunes y Soluciones

### Error: Cannot find module '@prisma/client'
```bash
npx prisma generate
```

### Error: Type 'X' is not assignable to type 'Prisma.XCreateInput'
- Asegúrate que los campos obligatorios estén presentes
- Verifica que las relaciones usen `connect: { id: value }`

### Error de conexión a PostgreSQL
- Verifica `DATABASE_URL` en `.env`
- Formato: `postgresql://user:password@host:port/database`

### Migración pendiente
```bash
npx prisma migrate dev
```

---

## 🔒 Validaciones Zod Avanzadas

```typescript
import { z } from 'zod';

// Enum desde Prisma
const OrderStatusEnum = z.enum(['PENDING', 'PAID', 'CANCELLED']);

// Decimal como string o number
const priceSchema = z.union([
  z.string().regex(/^\d+(\.\d{1,2})?$/, 'Formato de precio inválido'),
  z.number().positive(),
]);

// Array de items anidados
const createOrderSchema = z.object({
  partnerId: z.string().uuid(),
  branchId: z.string().uuid(),
  orderItems: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitPrice: priceSchema,
    })
  ).min(1, 'Debe incluir al menos un producto'),
});

// Fechas
const dateSchema = z.coerce.date();
const dateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine(
  (data) => data.endDate >= data.startDate,
  { message: 'endDate debe ser mayor o igual a startDate' }
);
```

---

## 🔴 Redis: Cache y Sesiones

### Configuración del Proyecto

Tu proyecto ya tiene Redis configurado en `src/config/redis.ts` con:
- ✅ Conexión condicional (`REDIS_ENABLED=true`)
- ✅ TLS automático para URLs `rediss://`
- ✅ Reconexión automática con backoff
- ✅ Serialización JSON automática

### Variables de Entorno

```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
# o para producción con TLS:
REDIS_URL=rediss://user:password@host:6379
```

### API del Cliente Redis

```typescript
import { redis } from '@/config/redis';

// Verificar estado
if (redis.status) {
  console.log('Redis está operativo');
}

// GET con tipado
const user = await redis.get<User>('user:123');

// SET con TTL (segundos)
await redis.set('user:123', userData, 3600); // 1 hora

// DELETE una clave
await redis.del('user:123');

// DELETE por prefijo (usando SCAN, seguro para producción)
await redis.deleteKeysByPrefix('user:');

// PING para health check
const isAlive = await redis.ping();
```

### Patrones de Cache

#### 1. Cache-Aside (Read-Through)

```typescript
// src/module/customer/product/product.service.ts
import { redis } from '@/config/redis';
import prisma from '@/config/prisma';

const CACHE_TTL = 300; // 5 minutos
const CACHE_PREFIX = 'products:';

export const ProductService = {
  async getById(id: string) {
    const cacheKey = `${CACHE_PREFIX}${id}`;
    
    // 1. Intentar obtener del cache
    const cached = await redis.get<Product>(cacheKey);
    if (cached) return cached;
    
    // 2. Si no está, buscar en DB
    const product = await prisma.product.findUnique({ where: { id } });
    
    // 3. Guardar en cache para próximas consultas
    if (product) {
      await redis.set(cacheKey, product, CACHE_TTL);
    }
    
    return product;
  },
  
  async update(id: string, data: UpdateProductInput) {
    const updated = await prisma.product.update({ where: { id }, data });
    
    // Invalidar cache después de actualizar
    await redis.del(`${CACHE_PREFIX}${id}`);
    
    return updated;
  },
};
```

#### 2. Cache de Listas con Paginación

```typescript
export const ProductService = {
  async findAll(societyId: string, page = 1, limit = 10) {
    const cacheKey = `products:list:${societyId}:${page}:${limit}`;
    
    const cached = await redis.get<PaginatedResult<Product>>(cacheKey);
    if (cached) return cached;
    
    const skip = (page - 1) * limit;
    const [data, total] = await prisma.$transaction([
      prisma.product.findMany({
        where: { societyId, isDeleted: false },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where: { societyId, isDeleted: false } }),
    ]);
    
    const result = {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
    
    await redis.set(cacheKey, result, 120); // 2 minutos
    return result;
  },
  
  // Invalidar todas las listas cuando hay cambios
  async invalidateListCache(societyId: string) {
    await redis.deleteKeysByPrefix(`products:list:${societyId}:`);
  },
};
```

#### 3. Cache de Configuración/Catálogos

```typescript
// Para datos que cambian poco (categorías, tipos de documento, etc.)
export const CategoryService = {
  async getAll(societyId: string) {
    const cacheKey = `categories:all:${societyId}`;
    
    const cached = await redis.get<Category[]>(cacheKey);
    if (cached) return cached;
    
    const categories = await prisma.category.findMany({
      where: { societyId, isDeleted: false },
      orderBy: { name: 'asc' },
    });
    
    // Cache largo para catálogos: 1 hora
    await redis.set(cacheKey, categories, 3600);
    return categories;
  },
};
```

### Invalidación de Cache

#### Por Eventos (Recomendado)

```typescript
// Hook después de crear/actualizar/eliminar
export const ProductService = {
  async create(data: CreateProductInput) {
    const product = await prisma.product.create({ data });
    
    // Invalidar listas relacionadas
    await redis.deleteKeysByPrefix(`products:list:${data.societyId}:`);
    
    return product;
  },
};
```

#### Por TTL (Time-To-Live)

```typescript
// Datos que pueden estar ligeramente desactualizados
await redis.set('dashboard:stats', stats, 60); // 1 minuto
```

### Claves de Cache: Convención de Nombres

| Patrón | Ejemplo | Uso |
|--------|---------|-----|
| `entity:id` | `product:abc-123` | Registro individual |
| `entity:list:filters` | `products:list:society1:1:10` | Listas paginadas |
| `entity:all:scope` | `categories:all:society1` | Catálogos completos |
| `session:userId` | `session:user-456` | Sesiones de usuario |
| `rate:ip` | `rate:192.168.1.1` | Rate limiting |

### Rate Limiting con Redis

```typescript
export const rateLimiter = async (ip: string, limit = 100, window = 60) => {
  if (!redis.status) return true; // Si Redis no está, permitir
  
  const key = `rate:${ip}`;
  const current = await redis.get<number>(key) || 0;
  
  if (current >= limit) {
    return false; // Límite excedido
  }
  
  await redis.set(key, current + 1, window);
  return true;
};

// En middleware
export const rateLimitMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const allowed = await rateLimiter(req.ip || 'unknown');
  if (!allowed) {
    return res.status(429).json({ message: 'Too many requests' });
  }
  next();
};
```

### Health Check Endpoint

```typescript
// src/routes/health.ts
import { redis } from '@/config/redis';
import prisma from '@/config/prisma';

export const healthCheck = async (_req: Request, res: Response) => {
  const checks = {
    api: true,
    database: false,
    redis: false,
  };
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {}
  
  checks.redis = await redis.ping();
  
  const allHealthy = Object.values(checks).every(Boolean);
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
  });
};
```

### Errores Comunes y Soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `ECONNREFUSED` | Redis no está corriendo | Verificar Docker o servicio Redis |
| `NOAUTH` | Falta autenticación | Agregar password en `REDIS_URL` |
| Cache desactualizado | Falta invalidación | Agregar `redis.del()` en updates |
| Memory overflow | Sin TTL | Siempre usar TTL en `set()` |

---

## 🚀 Scripts del Proyecto

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Inicia servidor desarrollo con hot-reload |
| `npm run prisma:generate` | Regenera cliente Prisma |
| `npm run prisma:migrate` | Ejecuta migraciones dev |
| `npm run prisma:studio` | Abre GUI de base de datos |
| `npm run prisma:seed` | Ejecuta seed de datos |
| `npm run docker:dev` | Inicia ambiente Docker desarrollo |

---

## 📚 Referencias

- [Prisma Docs](https://www.prisma.io/docs)
- [Zod Docs](https://zod.dev)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [Redis Commands](https://redis.io/commands)
- [Node Redis Client](https://github.com/redis/node-redis)
