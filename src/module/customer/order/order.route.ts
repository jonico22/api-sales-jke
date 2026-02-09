import { Router } from 'express';
import { OrderController } from './order.controller';

const router = Router();

/**
 * @openapi
 * /orders:
 *   get:
 *     summary: Listar todas las ordenes con filtros
 *     tags: [Order]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, COMPLETED, CANCELLED] }
 *     responses:
 *       200:
 *         description: Lista de ordenes paginada
 */
router.get('/', OrderController.getAll);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Obtener detalle de una orden
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Detalle de orden
 *       404:
 *         description: No encontrada
 */
router.get('/:id', OrderController.getById);

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Crear nueva orden
 *     tags: [Order]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrder'
 *     responses:
 *       201:
 *         description: Orden creada
 */
router.post('/', OrderController.create);

/**
 * @openapi
 * /orders/{id}:
 *   put:
 *     summary: Actualizar orden (cabecera)
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateOrder'
 *     responses:
 *       200:
 *         description: Orden actualizada
 */
router.put('/:id', OrderController.update);

/**
 * @openapi
 * /orders/{id}:
 *   delete:
 *     summary: Cancelar orden
 *     tags: [Order]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Orden cancelada
 */
router.delete('/:id', OrderController.delete);

export default router;
