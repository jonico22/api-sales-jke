import { Router } from 'express';

import societyRoutes from '@/module/customer/society/society.route';
import productRoutes from '@/module/customer/product/product.route';
import branchOfficeRoutes from '@/module/customer/branchOffice/branchoffice.route';
import branchOfficeProductRoutes from '@/module/customer/branchOfficeProduct/branchofficeproduct.route';
import purchaseDetailRoutes from '@/module/customer/purchaseDetail/purchaseDetail.routes';
import purchaseRoutes from '@/module/customer/purchase/purchase.routes';

import orderRoutes from '@/module/customer/order/order.route';
import orderItemRoutes from '@/module/customer/orderItem/orderItem.route';
import orderPaymentRoutes from '@/module/customer/orderPayment/orderPayment.route';
import societyReceiptRoutes from '@/module/customer/societyReceipt/societyReceipt.routes';
import outgoingConsignmentAgreementRoutes from '@/module/customer/outgoingConsignmentAgreement/outgoingConsignmentAgreement.route';
import deliveredConsignmentAgreementRoutes from '@/module/customer/deliveredConsignmentAgreement/deliveredConsignmentAgreement.route';
import receivedConsignmentSettlementRoutes from '@/module/customer/receivedConsignmentSettlement/receivedConsignmentSettlement.route';

const router = Router();

// modulo de clientes
router.use('/societies', societyRoutes);
router.use('/products', productRoutes);
router.use('/branch-offices', branchOfficeRoutes);
router.use('/branch-office-products', branchOfficeProductRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/purchase-details', purchaseDetailRoutes);
router.use('/orders', orderRoutes);
router.use('/order-items', orderItemRoutes);
router.use('/order-payments', orderPaymentRoutes);
router.use('/society-receipts', societyReceiptRoutes);
router.use('/outgoing-consignment-agreements', outgoingConsignmentAgreementRoutes);
router.use('/delivered-consignment-agreements', deliveredConsignmentAgreementRoutes);
router.use('/received-consignment-settlements', receivedConsignmentSettlementRoutes);

export default router;