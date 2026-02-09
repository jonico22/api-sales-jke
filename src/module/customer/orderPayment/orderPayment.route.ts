
import { Router } from 'express'
import { OrderPaymentController } from './orderPayment.controller'

const router = Router()

router.post('/', OrderPaymentController.create)
router.get('/', OrderPaymentController.getAll)
router.get('/:id', OrderPaymentController.findById)
router.patch('/:id', OrderPaymentController.update)
router.delete('/:id', OrderPaymentController.delete)

export default router
