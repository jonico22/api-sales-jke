import { Router } from 'express'
import { orderItemController } from './orderItem.controller'

const router = Router()

router.post('/', orderItemController.create)
router.get('/', orderItemController.findAll)
router.get('/:id', orderItemController.findById)
router.put('/:id', orderItemController.update)
router.delete('/:id', orderItemController.delete)

export default router
