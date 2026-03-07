# Guía para Generar una Migración Limpia (Squash Migrations)

Este documento contiene los pasos detallados para limpiar el historial de migraciones de Prisma y generar un único archivo de migración inicial (`init`). Esto es muy útil cuando el historial de migraciones en desarrollo se ha vuelto largo y desordenado.

## ⚠️ Advertencia Importante
**Este proceso borrará todos los datos de tu base de datos de desarrollo local.**
Asegúrate de no ejecutar esto apuntando a una base de datos de producción a menos que sepas exactamente lo que estás haciendo (ver la sección de Producción al final).

---

## Pasos a ejecutar en tu entorno local (Desarrollo)

### Paso 1: Eliminar el historial actual de migraciones
Primero, debes borrar o renombrar la carpeta de migraciones actual para que Prisma no intente leer el historial antiguo.

1. Navega a la carpeta de tu backend.
2. Elimina la carpeta `prisma/migrations` por completo.
   *(Alternativa: renómbrala a `prisma/migrations_old` si quieres tener un respaldo de emergencia por si acaso).*

### Paso 2: Resetear y sincronizar la base de datos
Debemos borrar la base de datos actual y forzar a que Prisma cree las tablas desde cero, basándose únicamente en el estado actual de tu archivo `prisma/schema.prisma`.

Ejecuta el siguiente comando en tu terminal:
```bash
npx prisma db push --force-reset
```
*Nota: Este comando eliminará todas las tablas (incluyendo la tabla interna `_prisma_migrations`) y las volverá a crear limpias.*

### Paso 3: Generar la nueva migración "Init" primaria
Ahora que la base de datos y tu `schema.prisma` están perfectamente alineados, vamos a generar la nueva migración (el único archivo consolidado).

Ejecuta en tu terminal:
```bash
npx prisma migrate dev --name init
```
Esto creará nuevamente la carpeta `prisma/migrations` con una única carpeta en su interior (p. ej. `20260307123456_init`) que contiene todo el SQL estructurado desde cero.

### Paso 4: Restaurar Semillas / Datos Base (Opcional)
Dado que la base de datos fue borrada en el Paso 2, puedes ejecutar tu script de inserción (seeds) para poblar la base de datos con los datos mínimos necesarios (como el usuario administrador, monedas por defecto, etc.).

```bash
npx prisma db seed
```

---

## 🚨 Consideraciones para Servidores de Producción (o QAS/Staging)

Si necesitas llevar este nuevo punto de inicio (`init`) a un entorno productivo **donde NO puedes perder los datos**, se usa un proceso llamado "Baselining":

1. Aplica los Pasos 1, 2 y 3 **solamente en tu máquina local de desarrollo**.
2. Sube la nueva carpeta `prisma/migrations` a tu repositorio (Git).
3. Conéctate al servidor de producción.
4. Ejecuta el siguiente comando marcando la migración `init` como ya aplicada (para que no intente crear las tablas que ya existen):

```bash
npx prisma migrate resolve --applied "el_nombre_de_la_carpeta_init"
```
*(Reemplaza `"el_nombre_de_la_carpeta_init"` por el nombre exacto de la subcarpeta que se generó dentro de `prisma/migrations`, por ejemplo: `20260307123456_init`)*.

5. A partir de aquí, las futuras migraciones en producción se aplicarán de forma convencional con `npx prisma migrate deploy`.
