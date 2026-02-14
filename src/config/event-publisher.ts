import client from '@/config/redis';
import { v4 as uuidv4 } from 'uuid';

// Global Event Channel
const EVENT_CHANNEL = 'inter_api_events';

// Enums matching the requested service schema
export enum NotificationType {
    SALES = 'SALES',
    STOCK = 'STOCK',
    REPORTS = 'REPORTS',
    SYSTEM = 'SYSTEM'
}

export enum NotificationPriority {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    URGENT = 'URGENT'
}

export interface NotificationPayload {
    id?: string; // Optional, generated if missing
    type: NotificationType;
    title: string;
    message: string;
    read?: boolean;
    subscriptionId: string;
    priority?: NotificationPriority;
    link?: string;
    metadata?: any;
    isDeleted?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Publish a Notification (Stored in History by Consumer)
 */
export const publishNotification = async (notification: NotificationPayload) => {


    if (!client.isReady) {
        console.warn('[EventPublisher] ⚠️ Redis client is not ready. Skipping notification.');
        return;
    }

    const payload = JSON.stringify({
        action: 'NOTIFY',
        businessId: notification.subscriptionId, // Mapped to subscriptionId as per user request context
        // Actually, user schema has `subscriptionId`.
        // The previous code had `businessId` and `subscriptionId`.
        // The new schema has `subscriptionId` as a relation.
        // I will pass the raw notification object in `data`.
        data: {
            id: notification.id || uuidv4(),
            type: notification.type,
            title: notification.title,
            message: notification.message,
            read: notification.read || false,
            subscriptionId: notification.subscriptionId,
            priority: notification.priority || NotificationPriority.MEDIUM,
            link: notification.link,
            metadata: notification.metadata,
            createdAt: new Date(),
            updatedAt: new Date()
        }
    });

    try {
        await client.publish(EVENT_CHANNEL, payload);
        console.log('[EventPublisher] 📨 Evento NOTIFY enviado');
    } catch (error) {
        console.error('[EventPublisher] Error publishing NOTIFY:', error);
    }
};

/**
 * Publish Realtime Table Update (Ephemeral, not stored)
 */
export const publishRealtimeUpdate = async (
    subscriptionId: string | undefined,
    entityType: string,
    data: any
) => {
    if (!client.isReady) return;

    const payload = JSON.stringify({
        action: 'UPDATE_TABLE',
        subscriptionId, // Used for routing to specific client/tenant
        data: { entity: entityType, ...data }
    });

    try {
        await client.publish(EVENT_CHANNEL, payload);
    } catch (error) {
        console.error('[EventPublisher] Error publishing UPDATE_TABLE:', error);
    }
};