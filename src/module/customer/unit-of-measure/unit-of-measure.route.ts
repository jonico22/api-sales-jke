import { Router } from 'express';
import { UnitOfMeasureController } from './unit-of-measure.controller';

const router = Router();

/**
 * @openapi
 * /unit-of-measures:
 *   get:
 *     summary: Obtener todas las unidades de medida
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: societyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista paginada
 */
router.get('/', UnitOfMeasureController.getAll);

/**
 * @openapi
 * /unit-of-measures/select:
 *   get:
 *     summary: Obtener unidades para select/dropdown
 *     parameters:
 *       - in: query
 *         name: societyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista simple
 */
router.get('/select', UnitOfMeasureController.getForSelect);

/**
 * @openapi
 * /unit-of-measures/{id}:
 *   get:
 *     summary: Obtener por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detalle de la unidad
 */
router.get('/:id', UnitOfMeasureController.getById);

/**
 * @openapi
 * /unit-of-measures:
 *   post:
 *     summary: Crear unidad de medida
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUnitOfMeasure'
 *     responses:
 *       201:
 *         description: Creado
 */
router.post('/', UnitOfMeasureController.create);

/**
 * @openapi
 * /unit-of-measures/{id}:
 *   put:
 *     summary: Actualizar unidad de medida
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUnitOfMeasure'
 *     responses:
 *       200:
 *         description: Actualizado
 */
router.put('/:id', UnitOfMeasureController.update);

/**
 * @openapi
 * /unit-of-measures/{id}:
 *   delete:
 *     summary: Eliminar unidad de medida
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Eliminado
 */
router.delete('/:id', UnitOfMeasureController.delete);

export default router;
