import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const LIMA_TIMEZONE = 'America/Lima';

/**
 * Formatea una fecha a la zona horaria de Lima, Perú
 * @param date - Fecha a formatear (Date, string, o number)
 * @param formatStr - Formato deseado (por defecto: 'dd/MM/yyyy HH:mm:ss')
 * @returns Fecha formateada como string
 */
export const formatToLimaTime = (
    date: Date | string | number,
    formatStr: string = 'dd/MM/yyyy HH:mm:ss'
): string => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const zonedDate = toZonedTime(dateObj, LIMA_TIMEZONE);
    return format(zonedDate, formatStr);
};

/**
 * Convierte una fecha a la zona horaria de Lima, Perú
 * @param date - Fecha a convertir
 * @returns Fecha en zona horaria de Lima
 */
export const toLimaTimezone = (date: Date | string | number): Date => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    return toZonedTime(dateObj, LIMA_TIMEZONE);
};
