import { Router } from 'express';
import { CategoryController } from './category.controller';
import { CategoryBulkController } from './category.bulk.controller';
import { disableNewRelicForRoute } from '@/middlewares/disableNewRelic.middleware';

const router = Router();

router.get('/', CategoryController.getAll);

/**
 * @openapi
 * /categories/select:
 *   get:
 *     summary: Obtener categorías para select/dropdown (sin paginación)
 *     parameters:
 *       - in: query
 *         name: societyCode
 *         schema:
 *           type: string
 *         description: Código de la sociedad (opcional)
 *     responses:
 *       200:
 *         description: Lista de categorías (id, name, code)
 */
// Endpoint para obtener usuarios únicos que han creado (útil para filtros)
router.get('/created-by-users', CategoryController.getCreatedByUsers);
// Endpoint para obtener usuarios únicos que han actualizado (útil para filtros)
router.get('/updated-by-users', CategoryController.getUpdatedByUsers);

router.get('/select', CategoryController.getForSelect);

router.get('/:id', CategoryController.getById);
/**
 * @openapi
 * /categories:
 *   post:
 *     summary: Crear una nueva categoría
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategory'
 *     responses:
 *       201:
 *         description: Categoría creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Category'
 */
router.post('/', CategoryController.create);

/**
 * @openapi
 * /categories/bulk-upload:
 *   post:
 *     summary: Carga masiva de categorías vía CSV
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: query
 *         name: societyCode
 *         required: true
 *         schema:
 *           type: string
 *         description: Código de la sociedad
 *       - in: query
 *         name: createdBy
 *         required: true
 *         schema:
 *           type: string
 *         description: Usuario que realiza la carga masiva
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Categorías cargadas
 */
router.post('/bulk-upload',
    disableNewRelicForRoute,
    CategoryBulkController.uploadMiddleware,
    CategoryBulkController.bulkUpload
);
router.put('/:id', CategoryController.update);
router.delete('/:id', CategoryController.delete);

export default router;
