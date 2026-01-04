import { Router } from 'express'
import { orderPaymentController } from './orderPayment.controller'

const router = Router()

router.post('/', orderPaymentController.create)
router.get('/', orderPaymentController.findAll)
router.get('/:id', orderPaymentController.findById)
router.put('/:id', orderPaymentController.update)
router.delete('/:id', orderPaymentController.delete)

export default router
