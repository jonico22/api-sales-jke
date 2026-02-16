
import { Worker } from 'bullmq';
import { OrderService } from '@/module/customer/order/order.service';
import { StorageService } from '@/module/customer/file/storage.service';
import { FileService } from '@/module/customer/file/file.service';
import { publishNotification, NotificationType, NotificationPriority } from '@/config/event-publisher';

import { connection } from '@/config/queue';
import prisma from '@/config/prisma';

export const reportWorker = new Worker('reports', async job => {
    console.log(`[ReportWorker] Procesando trabajo ${job.id}: ${job.name}`);

    try {
        const { filters, userId, societyId } = job.data;

        // Resolve Society Context FIRST to ensure we have a valid ID for File creation
        let targetSocietyId = societyId;
        let targetSubscriptionId = undefined;

        // Si no viene directo, intentamos resolverlo de los filtros
        if (!targetSocietyId) {
            const codeOrId = filters?.societyCode || filters?.societyId;
            if (codeOrId) {
                // Check if UUID
                const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(codeOrId);

                if (isUuid) {
                    targetSocietyId = codeOrId;
                    // Optional: fetch subscriptionId if needed later
                    const s = await prisma.society.findUnique({ where: { id: targetSocietyId } });
                    targetSubscriptionId = s?.subscriptionId;
                } else {
                    // It is a code
                    const s = await prisma.society.findUnique({ where: { code: codeOrId } });
                    if (s) {
                        targetSocietyId = s.id;
                        targetSubscriptionId = s.subscriptionId;
                    }
                }
            }
        } else {
            // societyId passed directly (assuming it's UUID from controller context if set, but controller set it to undefined if code!)
            // Re-verify just in case
            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(targetSocietyId);
            if (!isUuid) {
                const s = await prisma.society.findUnique({ where: { code: targetSocietyId } });
                if (s) {
                    targetSocietyId = s.id;
                    targetSubscriptionId = s.subscriptionId;
                }
            }
        }

        if (!targetSocietyId) {
            console.warn('[ReportWorker] ⚠️ No se pudo resolver societyId para el reporte. El archivo se guardará sin asociación o fallará si es obligatorio.');
        }

        // 1. Generar Buffer y obtener subscriptionId
        console.log(`[ReportWorker] Generando Excel para filtros:`, filters);
        const { buffer, subscriptionId: serviceSubscriptionId } = await OrderService.getReport(filters);

        // Prioridad de subscriptionId: Service > Resolved > passed
        const finalSubscriptionId = serviceSubscriptionId || targetSubscriptionId || societyId;

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
            societyId: targetSocietyId, // Asociar a la sociedad correcta (UUID)
            category: 'REPORT' as any, // Cast to any if enum strictness issue, or import FileCategory
            uploadedById: userId,
            expiresAt: expiresAt
        });

        console.log(`[ReportWorker] Archivo registrado con ID: ${fileRecord.id}`);

        // 4. Notificar al Usuario
        if (finalSubscriptionId) {
            try {
                await publishNotification({
                    type: NotificationType.SYSTEM, // Or specific REPORT type
                    title: 'Reporte Generado',
                    message: `El reporte de ventas ha sido generado exitosamente.`,
                    subscriptionId: finalSubscriptionId,
                    priority: NotificationPriority.MEDIUM,
                    link: uploadResult.url, // Link directo de descarga
                    metadata: {
                        fileId: fileRecord.id,
                        type: 'report_download'
                    }
                });
            } catch (notifyError) {
                console.error('[ReportWorker] ❌ Error al enviar notificación:', notifyError);
            }
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
