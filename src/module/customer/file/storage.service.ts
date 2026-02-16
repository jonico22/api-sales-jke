import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner'; // Optional: for private buckets
import { Upload } from '@aws-sdk/lib-storage';
import { r2Client } from '@/config/r2';
import { envs } from '@/config/envs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

export const StorageService = {
    /**
     * Subir archivo a R2/S3
     * @param file Buffer o Stream del archivo
     * @param originalName Nombre original del archivo para extraer extensión
     * @param folder Carpeta destino (opcional)
     * @param mimeType Tipo MIME
     */
    async uploadFile(file: Buffer, originalName: string, folder: string = 'uploads', mimeType: string) {
        const extension = path.extname(originalName);
        const fileName = `${uuidv4()}${extension}`;
        const key = `${folder}/${fileName}`;

        try {
            const parallelUploads3 = new Upload({
                client: r2Client,
                params: {
                    Bucket: envs.R2_BUCKET_NAME,
                    Key: key,
                    Body: file,
                    ContentType: mimeType,
                    // ACL: 'public-read', // R2 usually handles visibility via bucket settings or worker
                },
            });

            await parallelUploads3.done();

            // Construct Public URL (if configured)
            const publicUrl = envs.R2_PUBLIC_URL
                ? `${envs.R2_PUBLIC_URL}/${key}`
                : `${envs.R2_ENDPOINT}/${envs.R2_BUCKET_NAME}/${key}`;

            return {
                key,
                url: publicUrl,
                name: fileName,
                originalName,
            };
        } catch (error) {
            console.error('Error uplifting file to R2:', error);
            throw new Error('Error al subir archivo al almacenamiento');
        }
    },

    /**
     * Eliminar archivo de R2/S3
     * @param key Clave del archivo (ej: uploads/archivo.jpg)
     */
    async deleteFile(key: string) {
        try {
            const command = new DeleteObjectCommand({
                Bucket: envs.R2_BUCKET_NAME,
                Key: key,
            });
            await r2Client.send(command);
            return true;
        } catch (error) {
            console.error('Error deleting file from R2:', error);
            throw new Error('Error al eliminar archivo del almacenamiento');
        }
    },
};
