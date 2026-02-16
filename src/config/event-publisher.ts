import client, { redis } from '@/config/redis';
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


    // Check using the consistent wrapper status or client.isOpen
    // If client is Open but not Ready, node-redis queues commands by default.
    // We should only skip if it's completely closed/disabled.

    // Using the exported 'redis' wrapper to check if enabled
    if (!redis.enabled) return;

    // Use client.isOpen to allow queuing during reconnection
    if (!client.isOpen) {
        console.warn('[EventPublisher] ⚠️ Redis client is closed. Skipping notification.');
        return;
    }

    const payload = JSON.stringify({
        action: 'NOTIFY',
        businessId: notification.subscriptionId,
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
        const received = await client.publish(EVENT_CHANNEL, payload);
        console.log(`[EventPublisher] 📢 Notificación publicada en '${EVENT_CHANNEL}'. Receptores: ${received}. Payload start: ${payload.substring(0, 50)}...`);
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
    // Same check here
    if (!redis.enabled || !client.isOpen) return;

    const payload = JSON.stringify({
        action: 'UPDATE_TABLE',
        subscriptionId,
        data: { entity: entityType, ...data }
    });

    try {
        await client.publish(EVENT_CHANNEL, payload);
    } catch (error) {
        console.error('[EventPublisher] Error publishing UPDATE_TABLE:', error);
    }
};