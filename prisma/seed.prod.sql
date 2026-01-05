-- DocumentType
INSERT INTO public."DocumentType" 
(id,code,"name","createdAt","updatedAt","isActive","createdBy","updatedBy") 
select *
from (
	 select '4e0b3801-11b7-4fe2-9426-53e71139f63b','DNI','Documento nacional de identifdad',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,null
	 union all
	 select 'eedfd792-f935-497d-a351-ee3c0ddd01d3','RUC','Ruc',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,null
	 union all
	 select '248d9b93-47fb-4960-810a-3e3adcc18eb3','CE','Carnet de extranjeria',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,NULL
	 union all
	 select '00b23aff-6157-44f4-bb58-ed9898e455cf','PASAPORTE','Pasaporte',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,NULL
) as t
ON CONFLICT (id) DO NOTHING;

-- ReceiptType
INSERT INTO public."ReceiptType"
(id, code, "name", description, "isElectronic", "isActive", "createdAt", "updatedAt")
SELECT *
FROM (
    SELECT 'ae06b3af-3ed4-4d4f-a41f-2d7f942ca2c6', 'BL', 'Boleta de venta', 'Boleta de venta', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    UNION ALL
    SELECT 'a7c0b2b4-7cc1-40cf-9cd6-73b0b5ce6556', 'FA', 'Factura', 'Factura', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) t
ON CONFLICT (id) DO NOTHING;


-- Tax
INSERT INTO public."Tax"
(id, code, "name", value, "type", description, "isActive", "createdAt", "updatedAt")
SELECT *
FROM (
    SELECT 'd619aae6-4032-44cf-bc68-81500de37252', 'IGV', 'Impuesto a la renta', 18, 'percentage'::"TaxType",
           'Impuesto a la renta', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) t
ON CONFLICT (id) DO NOTHING;


-- Currency
INSERT INTO public."Currency"
(id, "name", code, symbol, "isActive",
 "createdAt", "updatedAt", "createdBy", "updatedBy")
SELECT *
FROM (
    SELECT '221c1d15-04c9-4159-9ed1-8c6b2ad18e47', 'Nuevos soles', 'PEN', 'S/.', true,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL
) t
ON CONFLICT (id) DO NOTHING;