/**
 * Utilidades para manejo de zona horaria Lima, Perú
 * Estrategia: Almacenar en UTC, convertir a Lima al mostrar
 */

const LIMA_TIMEZONE = 'America/Lima';

/**
 * Convierte una fecha UTC a string formateado en timezone de Lima
 * @param date - Fecha en UTC (como viene de Prisma)
 * @returns String con formato: "DD/MM/YYYY, HH:mm:ss"
 */
export const toLimaTime = (date: Date): string => {
    return date.toLocaleString('es-PE', {
        timeZone: LIMA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
};

/**
 * Obtiene la fecha/hora actual en zona horaria de Lima
 * @returns Date object con hora actual de Lima
 */
export const nowInLima = (): Date => {
    return new Date(new Date().toLocaleString('en-US', { timeZone: LIMA_TIMEZONE }));
};

/**
 * Formatea fecha para presentación amigable al usuario
 * @param date - Fecha a formatear
 * @returns String como "1 ene. 2024, 14:30"
 */
export const formatLimaDateTime = (date: Date): string => {
    return new Intl.DateTimeFormat('es-PE', {
        timeZone: LIMA_TIMEZONE,
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};

/**
 * Obtiene el offset actual de Lima en formato string
 * @returns String como "GMT-05:00" o "GMT-04:00" (durante horario de verano si aplicara)
 */
export const getLimaOffset = (): string => {
    const date = new Date();
    const limaTime = date.toLocaleTimeString('en-US', {
        timeZone: LIMA_TIMEZONE,
        timeZoneName: 'longOffset',
    });
    const match = limaTime.match(/GMT([+-]\d{2}:\d{2})/);
    return match ? `GMT${match[1]}` : 'GMT-05:00';
};

/**
 * Información de la zona horaria configurada
 */
export const timezoneInfo = {
    name: LIMA_TIMEZONE,
    locale: 'es-PE',
    get offset() {
        return getLimaOffset();
    },
    get current() {
        return formatLimaDateTime(new Date());
    },
};
