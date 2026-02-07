
import { Router } from 'express'
import { OrderItemController } from './orderItem.controller'

const router = Router()

router.post('/', OrderItemController.create)
router.get('/', OrderItemController.getAll)
router.get('/:id', OrderItemController.getById)
router.patch('/:id', OrderItemController.update)
router.delete('/:id', OrderItemController.delete)

export default router
