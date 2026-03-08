import { Router } from 'express';
import * as controller from './deliveredConsignmentAgreement.controller';

const router = Router();

/**
 * @openapi
 * /delivered-consignments:
 *   get:
 *     summary: Obtener todos los items entregados en consignación con paginación
 *     tags: [DeliveredConsignmentAgreement]
 */
router.get('/', controller.getAll);

/**
 * @openapi
 * /delivered-consignments/{id}:
 *   get:
 *     summary: Obtener item por ID
 *     tags: [DeliveredConsignmentAgreement]
 */
router.get('/:id', controller.getById);

/**
 * @openapi
 * /delivered-consignments:
 *   post:
 *     summary: Crear item entregado
 *     tags: [DeliveredConsignmentAgreement]
 */
router.post('/', controller.create);

/**
 * @openapi
 * /delivered-consignments/{id}:
 *   put:
 *     summary: Actualizar item entregado
 *     tags: [DeliveredConsignmentAgreement]
 */
router.put('/:id', controller.update);

/**
 * @openapi
 * /delivered-consignments/{id}:
 *   delete:
 *     summary: Eliminar item entregado
 *     tags: [DeliveredConsignmentAgreement]
 */
router.delete('/:id', controller.remove);

export default router;
