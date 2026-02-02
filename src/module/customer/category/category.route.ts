import { Router } from 'express';
import { CategoryController } from './category.controller';

const router = Router();

router.get('/', CategoryController.getAll);

/**
 * @openapi
 * /categories/select:
 *   get:
 *     summary: Obtener categorías para select/dropdown (sin paginación)
 *     parameters:
 *       - in: query
 *         name: societyId
 *         schema:
 *           type: string
 *         description: Código de la sociedad (opcional)
 *     responses:
 *       200:
 *         description: Lista de categorías (id, name, code)
 */
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
router.put('/:id', CategoryController.update);
router.delete('/:id', CategoryController.delete);

export default router;
