import { Router } from 'express'
import { orderController } from './order.controller'

const router = Router()

router.post('/', orderController.create)
router.get('/', orderController.findAll)
router.get('/:id', orderController.findById)
router.put('/:id', orderController.update)
router.delete('/:id', orderController.delete)

export default router
