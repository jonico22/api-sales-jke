
import { Worker } from 'bullmq';
import { OrderService } from '@/module/customer/order/order.service';
import { StorageService } from '@/module/customer/file/storage.service';
import { FileService } from '@/module/customer/file/file.service';
import { publishNotification, NotificationType, NotificationPriority } from '@/config/event-publisher';

import { connection } from '@/config/queue';

export const reportWorker = new Worker('reports', async job => {
    console.log(`[ReportWorker] Procesando trabajo ${job.id}: ${job.name}`);

    try {
        const { filters, userId, societyId } = job.data;

        // 1. Generar Buffer y obtener subscriptionId
        console.log(`[ReportWorker] Generando Excel para filtros:`, filters);
        const { buffer, subscriptionId: serviceSubscriptionId } = await OrderService.getReport(filters);

        // Usamos el subscriptionId devuelto por el servicio (que es el más confiable) 
        // o el que venía en el job como fallback
        const targetSubscriptionId = serviceSubscriptionId || societyId;

        // 2. Subir a R2 (Storage)
        // El usuario requiere guardar en temp/ para la política de borrado de 7 días
        const fileName = `reporte_ventas_${Date.now()}.xlsx`;
        console.log(`[ReportWorker] Subiendo archivo: ${fileName}`);

        // Storage Service expects: buffer, originalName, folder, mimeType
        const uploadResult = await StorageService.uploadFile(
            buffer,
            fileName,
            `temp/${userId}`, // Carpeta temp para regla de ciclo de vida
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        // 3. Crear Registro de Archivo (Metadata)
        // Set expiresAt to 7 days from now for reports
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const fileRecord = await FileService.create({
            name: fileName,
            path: uploadResult.url,
            key: uploadResult.key,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: buffer.length,
            storageType: 'EXTERNAL', // R2 is external/S3
            societyId: societyId, // Asociar a la sociedad correcta
            category: 'REPORT' as any, // Cast to any if enum strictness issue, or import FileCategory
            uploadedById: userId,
            expiresAt: expiresAt
        });

        console.log(`[ReportWorker] Archivo registrado con ID: ${fileRecord.id}`);

        // 4. Notificar al Usuario
        if (targetSubscriptionId) {
            await publishNotification({
                type: NotificationType.SYSTEM, // Or specific REPORT type
                title: 'Reporte Generado',
                message: `El reporte de ventas ha sido generado exitosamente.`,
                subscriptionId: targetSubscriptionId, // Usar el ID resuelto
                priority: NotificationPriority.HIGH,
                link: uploadResult.url, // Link directo de descarga
                metadata: {
                    fileId: fileRecord.id,
                    type: 'report_download'
                }
            });
        }

        return { fileId: fileRecord.id, url: uploadResult.url };

    } catch (error) {
        console.error(`[ReportWorker] Error procesando trabajo ${job.id}:`, error);
        throw error;
    }
}, {
    connection,
    concurrency: 5 // Optional: process up to 5 reports in parallel
});

// Event listeners for logging
reportWorker.on('completed', job => {
    console.log(`[ReportWorker] Trabajo ${job.id} completado.`);
});

reportWorker.on('failed', (job, err) => {
    console.error(`[ReportWorker] Trabajo ${job?.id} falló: ${err.message}`);
});
