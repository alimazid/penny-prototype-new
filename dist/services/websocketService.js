"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSocketService = exports.getWebSocketServiceInstance = exports.setWebSocketServiceInstance = exports.WebSocketService = void 0;
const logger_1 = require("../utils/logger");
class WebSocketService {
    io;
    connectedClients = new Map();
    constructor(io) {
        this.io = io;
    }
    initialize() {
        this.io.on('connection', (socket) => {
            logger_1.logger.info(`Client connected: ${socket.id}`);
            this.connectedClients.set(socket.id, socket);
            // Handle client identification
            socket.on('identify', (data) => {
                logger_1.logger.info(`Client identified: ${socket.id}`, data);
                socket.data.user = data;
            });
            // Handle email processing status requests
            socket.on('subscribe_email_updates', () => {
                socket.join('email_updates');
                logger_1.logger.info(`Client ${socket.id} subscribed to email updates`);
            });
            // Handle performance monitoring requests
            socket.on('subscribe_performance', () => {
                socket.join('performance_updates');
                logger_1.logger.info(`Client ${socket.id} subscribed to performance updates`);
            });
            // Handle disconnect
            socket.on('disconnect', () => {
                logger_1.logger.info(`Client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket.id);
            });
            // Send initial connection confirmation
            socket.emit('connected', {
                id: socket.id,
                timestamp: new Date().toISOString(),
                message: 'Connected to Penny Prototype WebSocket'
            });
        });
        logger_1.logger.info('WebSocket service initialized');
    }
    // Broadcast email processing updates
    broadcastEmailUpdate(update) {
        this.io.to('email_updates').emit('email_update', {
            ...update,
            timestamp: new Date().toISOString()
        });
    }
    // Broadcast performance metrics
    broadcastPerformanceUpdate(metrics) {
        this.io.to('performance_updates').emit('performance_update', {
            metrics,
            timestamp: new Date().toISOString()
        });
    }
    // Send notification to specific client
    sendToClient(clientId, event, data) {
        const socket = this.connectedClients.get(clientId);
        if (socket) {
            socket.emit(event, {
                ...data,
                timestamp: new Date().toISOString()
            });
        }
    }
    // Broadcast system notifications
    broadcastSystemNotification(notification) {
        this.io.emit('system_notification', {
            ...notification,
            timestamp: new Date().toISOString()
        });
    }
    // Get connected clients count
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }
    // Get clients in specific room
    getClientsInRoom(room) {
        return new Promise((resolve) => {
            this.io.in(room).allSockets().then(sockets => {
                resolve(Array.from(sockets));
            });
        });
    }
}
exports.WebSocketService = WebSocketService;
// Export singleton instance that will be initialized in server.ts
let webSocketServiceInstance = null;
const setWebSocketServiceInstance = (instance) => {
    webSocketServiceInstance = instance;
};
exports.setWebSocketServiceInstance = setWebSocketServiceInstance;
const getWebSocketServiceInstance = () => {
    return webSocketServiceInstance;
};
exports.getWebSocketServiceInstance = getWebSocketServiceInstance;
// For backwards compatibility
exports.webSocketService = {
    broadcastEmailUpdate: (update) => {
        if (webSocketServiceInstance) {
            webSocketServiceInstance.broadcastEmailUpdate(update);
        }
    }
};
//# sourceMappingURL=websocketService.js.map