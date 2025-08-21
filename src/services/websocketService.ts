import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';

export class WebSocketService {
  private io: SocketIOServer;
  private connectedClients: Map<string, Socket> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  initialize() {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);
      this.connectedClients.set(socket.id, socket);

      // Handle client identification
      socket.on('identify', (data) => {
        logger.info(`Client identified: ${socket.id}`, data);
        socket.data.user = data;
      });

      // Handle email processing status requests
      socket.on('subscribe_email_updates', () => {
        socket.join('email_updates');
        logger.info(`Client ${socket.id} subscribed to email updates`);
      });

      // Handle performance monitoring requests
      socket.on('subscribe_performance', () => {
        socket.join('performance_updates');
        logger.info(`Client ${socket.id} subscribed to performance updates`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });

      // Send initial connection confirmation
      socket.emit('connected', {
        id: socket.id,
        timestamp: new Date().toISOString(),
        message: 'Connected to Penny Prototype WebSocket'
      });
    });

    logger.info('WebSocket service initialized');
  }

  // Broadcast email processing updates
  broadcastEmailUpdate(update: {
    type: 'started' | 'classified' | 'extracted' | 'completed' | 'failed';
    emailId: string;
    accountId?: string;
    progress?: number;
    message?: string;
    data?: any;
  }) {
    this.io.to('email_updates').emit('email_update', {
      ...update,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast performance metrics
  broadcastPerformanceUpdate(metrics: any) {
    this.io.to('performance_updates').emit('performance_update', {
      metrics,
      timestamp: new Date().toISOString()
    });
  }

  // Send notification to specific client
  sendToClient(clientId: string, event: string, data: any) {
    const socket = this.connectedClients.get(clientId);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Broadcast system notifications
  broadcastSystemNotification(notification: {
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    data?: any;
  }) {
    this.io.emit('system_notification', {
      ...notification,
      timestamp: new Date().toISOString()
    });
  }

  // Get connected clients count
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // Get clients in specific room
  getClientsInRoom(room: string): Promise<string[]> {
    return new Promise((resolve) => {
      this.io.in(room).allSockets().then(sockets => {
        resolve(Array.from(sockets));
      });
    });
  }
}

// Export singleton instance that will be initialized in server.ts
let webSocketServiceInstance: WebSocketService | null = null;

export const setWebSocketServiceInstance = (instance: WebSocketService) => {
  webSocketServiceInstance = instance;
};

export const getWebSocketServiceInstance = (): WebSocketService | null => {
  return webSocketServiceInstance;
};

// For backwards compatibility
export const webSocketService = {
  broadcastEmailUpdate: (update: any) => {
    if (webSocketServiceInstance) {
      webSocketServiceInstance.broadcastEmailUpdate(update);
    }
  }
};