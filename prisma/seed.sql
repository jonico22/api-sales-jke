
-- DocumentType
INSERT INTO public."DocumentType" 
(id,code,"name","createdAt","updatedAt","isActive","createdBy","updatedBy") 
select *
from (
	 select '1','DNI','Documento nacional de identifdad',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,null
	 union all
	 select '2','RUC','Ruc',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,null
	 union all
	 select '3','CE','Carnet de extranjeria',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,NULL
	 union all
	 select '4','PASAPORTE','Pasaporte',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,true,NULL,NULL
) as t
where not exists (
 SELECT 1 FROM public."DocumentType"
);

	 
-- ReceiptType
INSERT INTO public."ReceiptType"
(id, code, "name", description, "isElectronic", "isActive", "createdAt", "updatedAt")
SELECT *
FROM (
    SELECT '1', 'BL', 'Boleta de venta', 'Boleta de venta', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    UNION ALL
    SELECT '2', 'FA', 'Factura', 'Factura', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) t
WHERE NOT EXISTS (
    SELECT 1 FROM public."ReceiptType"
);



-- Tax
INSERT INTO public."Tax"
(id, code, "name", value, "type", description, "isActive", "createdAt", "updatedAt")
SELECT *
FROM (
    SELECT '1', 'IGV', 'Impuesto a la renta', 18, 'percentage'::"TaxType",
           'Impuesto a la renta', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) t
WHERE NOT EXISTS (
    SELECT 1 FROM public."Tax"
);

-- Currency
INSERT INTO public."Currency"
(id, "name", code, symbol, "isActive",
 "createdAt", "updatedAt", "createdBy", "updatedBy")
SELECT *
FROM (
    SELECT '1', 'Nuevos soles', 'PEN', 'S/.', true,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL
) t
WHERE NOT EXISTS (
    SELECT 1 FROM public."Currency"
);