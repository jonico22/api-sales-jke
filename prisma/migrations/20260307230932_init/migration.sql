-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('LOCAL', 'S3', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('GENERAL', 'REPORT');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('issued', 'canceled', 'pending_send');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'NEVER');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PENDING_PAYMENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethodOrder" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'YAPE', 'PLIN', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsignmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED', 'PENDING');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE_ENTRY', 'SALE_EXIT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CONSIGNMENT_OUT', 'CONSIGNMENT_RETURN', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB');

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BussinessPartner" (
    "id" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL DEFAULT 'CUSTOMER',
    "typeBP" TEXT NOT NULL,
    "typeDocId" TEXT,
    "documentNumber" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "sex" TEXT,
    "surname" TEXT,
    "companyName" TEXT,
    "contactEmail" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "telephone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "societyId" TEXT NOT NULL,
    "tradeName" TEXT,
    "website" TEXT,
    "taxCondition" TEXT,
    "taxStatus" TEXT,
    "ubigeoId" CHAR(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "branchOfficeProductId" TEXT,

    CONSTRAINT "BussinessPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "createdBy" TEXT,
    "societyId" TEXT,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "key" TEXT,
    "storageType" "StorageType" NOT NULL DEFAULT 'LOCAL',
    "category" "FileCategory" NOT NULL DEFAULT 'GENERAL',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "societyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedBy" TEXT,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tax" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "type" "TaxType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isElectronic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Society" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "legalEntityId" TEXT,
    "mainCurrencyId" TEXT,
    "receiptTypeId" TEXT,
    "logoId" TEXT,
    "stockNotificationFrequency" "Frequency" NOT NULL DEFAULT 'NEVER',
    "salesNotificationFrequency" "Frequency" NOT NULL DEFAULT 'DAILY',
    "backupFrequency" "Frequency" NOT NULL DEFAULT 'NEVER',
    "dataRetentionDays" INTEGER,
    "uiConfig" JSONB,
    "storageLimit" BIGINT NOT NULL DEFAULT 157286400,
    "maxUsers" INTEGER NOT NULL DEFAULT 3,
    "maxProducts" INTEGER NOT NULL DEFAULT 100,
    "usedStorage" BIGINT NOT NULL DEFAULT 0,
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Society_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "priceCost" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT NOT NULL DEFAULT 'TEMP-CODE',
    "societyId" TEXT NOT NULL,
    "barcode" TEXT,
    "brand" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'NIU',
    "unitOfMeasureId" TEXT,
    "color" TEXT,
    "colorCode" TEXT,
    "imageId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "categoryId" TEXT NOT NULL,
    "salesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "societyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "sunatCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "societyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchOffice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "societyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "code" TEXT,
    "email" TEXT,
    "ubigeoId" CHAR(6),

    CONSTRAINT "BranchOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchOfficeProduct" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchOfficeId" TEXT NOT NULL,
    "availableStock" INTEGER NOT NULL DEFAULT 0,
    "physicalStock" INTEGER NOT NULL DEFAULT 0,
    "reservedStock" INTEGER NOT NULL DEFAULT 0,
    "defectiveStock" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minStock" INTEGER,
    "maxStock" INTEGER,
    "lastRestockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "BranchOfficeProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "purchaseCode" TEXT,
    "paymentMethod" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "currencyId" TEXT NOT NULL,
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "subTotal" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "taxId" TEXT,
    "documentTypeId" TEXT,
    "documentNumber" TEXT,
    "branchOfficeId" TEXT NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseDetail" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "expirationDate" TIMESTAMP(3),

    CONSTRAINT "PurchaseDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBranchMovement" (
    "id" TEXT NOT NULL,
    "originBranchId" TEXT NOT NULL,
    "destinationBranchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityMoved" INTEGER NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "referenceCode" TEXT,
    "status" "MovementStatus" NOT NULL DEFAULT 'PENDING',
    "batchId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "ProductBranchMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "notes" TEXT,
    "paymentDate" TIMESTAMP(3),
    "comment" TEXT,
    "cancellationReason" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "currencyId" TEXT NOT NULL,
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "deliveryDate" TIMESTAMP(3),
    "shippingAddress" TEXT,
    "societyId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "comment" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currencyId" TEXT NOT NULL,
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "PaymentMethodOrder" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "referenceCode" TEXT,
    "imageId" TEXT,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "societyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyReceipt" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "orderPaymentId" TEXT NOT NULL,
    "fileId" TEXT,
    "xmlFileId" TEXT,
    "series" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "subTotal" DECIMAL(65,30) NOT NULL,
    "taxAmount" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'issued',
    "currencyId" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "receiptTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "SocietyReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingConsignmentAgreement" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "commissionRate" DECIMAL(65,30) NOT NULL,
    "agreementCode" TEXT,
    "status" "ConsignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "currencyId" TEXT NOT NULL,
    "totalValue" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "creditLimit" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "OutgoingConsignmentAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveredConsignmentAgreement" (
    "id" TEXT NOT NULL,
    "consignmentAgreementId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deliveredStock" INTEGER NOT NULL,
    "remainingStock" INTEGER,
    "costPrice" DECIMAL(10,2) NOT NULL,
    "suggestedSalePrice" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "totalValue" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "deliveryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveredConsignmentAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalConsignmentSale" (
    "id" TEXT NOT NULL,
    "deliveredConsignmentId" TEXT NOT NULL,
    "soldQuantity" INTEGER NOT NULL,
    "reportedSaleDate" TIMESTAMP(3) NOT NULL,
    "reportedSalePrice" DECIMAL(10,2) NOT NULL,
    "unitSalePrice" DECIMAL(10,2) NOT NULL,
    "totalCommissionAmount" DECIMAL(10,2) DEFAULT 0.0,
    "netTotal" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "remarks" TEXT,
    "documentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalConsignmentSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivedConsignmentSettlement" (
    "id" TEXT NOT NULL,
    "outgoingAgreementId" TEXT NOT NULL,
    "orderPaymentId" TEXT,
    "settlementDate" TIMESTAMP(3) NOT NULL,
    "totalReportedSalesAmount" DECIMAL(10,2) NOT NULL,
    "consigneeCommissionAmount" DECIMAL(10,2) NOT NULL,
    "totalReceivedAmount" DECIMAL(10,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "receiptReference" TEXT,
    "settlementNotes" TEXT,
    "currencyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivedConsignmentSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UbigeoPeru" (
    "ubigeo_id" CHAR(6) NOT NULL,
    "department" VARCHAR(100) NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "naturalRegion" VARCHAR(50),
    "region" VARCHAR(50),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),

    CONSTRAINT "UbigeoPeru_pkey" PRIMARY KEY ("ubigeo_id")
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "initialAmount" DECIMAL(10,2) NOT NULL,
    "finalReportedAmount" DECIMAL(10,2),
    "finalSystemAmount" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "incomeCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "incomeCard" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "incomeTransfer" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expenseCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currencyId" TEXT NOT NULL,
    "exchangeRate" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "paymentMethod" "PaymentMethodOrder" NOT NULL,
    "description" TEXT,
    "orderPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "branchOfficeId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "totalCost" DECIMAL(10,2) NOT NULL,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "documentNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SocietyToTax" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SocietyToTax_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_code_key" ON "DocumentType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BussinessPartner_documentNumber_key" ON "BussinessPartner"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BussinessPartner_email_key" ON "BussinessPartner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "File_key_key" ON "File"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tax_code_key" ON "Tax"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptType_code_key" ON "ReceiptType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Society_code_key" ON "Society"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Society_subscriptionId_key" ON "Society"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Society_legalEntityId_key" ON "Society"("legalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "Society_logoId_key" ON "Society"("logoId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_societyId_code_key" ON "Product"("societyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_societyId_code_key" ON "Category"("societyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_productId_userId_societyId_key" ON "Favorite"("productId", "userId", "societyId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_societyId_code_key" ON "UnitOfMeasure"("societyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BranchOffice_societyId_code_key" ON "BranchOffice"("societyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BranchOfficeProduct_productId_branchOfficeId_key" ON "BranchOfficeProduct"("productId", "branchOfficeId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyReceipt_societyId_receiptTypeId_series_receiptNumber_key" ON "SocietyReceipt"("societyId", "receiptTypeId", "series", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OutgoingConsignmentAgreement_agreementCode_key" ON "OutgoingConsignmentAgreement"("agreementCode");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_orderPaymentId_key" ON "CashMovement"("orderPaymentId");

-- CreateIndex
CREATE INDEX "_SocietyToTax_B_index" ON "_SocietyToTax"("B");

-- AddForeignKey
ALTER TABLE "BussinessPartner" ADD CONSTRAINT "BussinessPartner_typeDocId_fkey" FOREIGN KEY ("typeDocId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BussinessPartner" ADD CONSTRAINT "BussinessPartner_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BussinessPartner" ADD CONSTRAINT "BussinessPartner_ubigeoId_fkey" FOREIGN KEY ("ubigeoId") REFERENCES "UbigeoPeru"("ubigeo_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BussinessPartner" ADD CONSTRAINT "BussinessPartner_branchOfficeProductId_fkey" FOREIGN KEY ("branchOfficeProductId") REFERENCES "BranchOfficeProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Society" ADD CONSTRAINT "Society_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "BussinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Society" ADD CONSTRAINT "Society_mainCurrencyId_fkey" FOREIGN KEY ("mainCurrencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Society" ADD CONSTRAINT "Society_receiptTypeId_fkey" FOREIGN KEY ("receiptTypeId") REFERENCES "ReceiptType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Society" ADD CONSTRAINT "Society_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchOffice" ADD CONSTRAINT "BranchOffice_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchOffice" ADD CONSTRAINT "BranchOffice_ubigeoId_fkey" FOREIGN KEY ("ubigeoId") REFERENCES "UbigeoPeru"("ubigeo_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchOfficeProduct" ADD CONSTRAINT "BranchOfficeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchOfficeProduct" ADD CONSTRAINT "BranchOfficeProduct_branchOfficeId_fkey" FOREIGN KEY ("branchOfficeId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "BussinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "ReceiptType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchOfficeId_fkey" FOREIGN KEY ("branchOfficeId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDetail" ADD CONSTRAINT "PurchaseDetail_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDetail" ADD CONSTRAINT "PurchaseDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBranchMovement" ADD CONSTRAINT "ProductBranchMovement_originBranchId_fkey" FOREIGN KEY ("originBranchId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBranchMovement" ADD CONSTRAINT "ProductBranchMovement_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBranchMovement" ADD CONSTRAINT "ProductBranchMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BussinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyReceipt" ADD CONSTRAINT "SocietyReceipt_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyReceipt" ADD CONSTRAINT "SocietyReceipt_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyReceipt" ADD CONSTRAINT "SocietyReceipt_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyReceipt" ADD CONSTRAINT "SocietyReceipt_receiptTypeId_fkey" FOREIGN KEY ("receiptTypeId") REFERENCES "ReceiptType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyReceipt" ADD CONSTRAINT "SocietyReceipt_orderPaymentId_fkey" FOREIGN KEY ("orderPaymentId") REFERENCES "OrderPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyReceipt" ADD CONSTRAINT "SocietyReceipt_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyReceipt" ADD CONSTRAINT "SocietyReceipt_xmlFileId_fkey" FOREIGN KEY ("xmlFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingConsignmentAgreement" ADD CONSTRAINT "OutgoingConsignmentAgreement_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingConsignmentAgreement" ADD CONSTRAINT "OutgoingConsignmentAgreement_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingConsignmentAgreement" ADD CONSTRAINT "OutgoingConsignmentAgreement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingConsignmentAgreement" ADD CONSTRAINT "OutgoingConsignmentAgreement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BussinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveredConsignmentAgreement" ADD CONSTRAINT "DeliveredConsignmentAgreement_consignmentAgreementId_fkey" FOREIGN KEY ("consignmentAgreementId") REFERENCES "OutgoingConsignmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveredConsignmentAgreement" ADD CONSTRAINT "DeliveredConsignmentAgreement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveredConsignmentAgreement" ADD CONSTRAINT "DeliveredConsignmentAgreement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalConsignmentSale" ADD CONSTRAINT "ExternalConsignmentSale_deliveredConsignmentId_fkey" FOREIGN KEY ("deliveredConsignmentId") REFERENCES "DeliveredConsignmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedConsignmentSettlement" ADD CONSTRAINT "ReceivedConsignmentSettlement_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedConsignmentSettlement" ADD CONSTRAINT "ReceivedConsignmentSettlement_outgoingAgreementId_fkey" FOREIGN KEY ("outgoingAgreementId") REFERENCES "OutgoingConsignmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedConsignmentSettlement" ADD CONSTRAINT "ReceivedConsignmentSettlement_orderPaymentId_fkey" FOREIGN KEY ("orderPaymentId") REFERENCES "OrderPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_orderPaymentId_fkey" FOREIGN KEY ("orderPaymentId") REFERENCES "OrderPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_branchOfficeId_fkey" FOREIGN KEY ("branchOfficeId") REFERENCES "BranchOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SocietyToTax" ADD CONSTRAINT "_SocietyToTax_A_fkey" FOREIGN KEY ("A") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SocietyToTax" ADD CONSTRAINT "_SocietyToTax_B_fkey" FOREIGN KEY ("B") REFERENCES "Tax"("id") ON DELETE CASCADE ON UPDATE CASCADE;
