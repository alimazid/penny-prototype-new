import { Server as SocketIOServer } from 'socket.io';
export declare class WebSocketService {
    private io;
    private connectedClients;
    constructor(io: SocketIOServer);
    initialize(): void;
    broadcastEmailUpdate(update: {
        type: 'started' | 'classified' | 'extracted' | 'completed' | 'failed';
        emailId: string;
        accountId?: string;
        progress?: number;
        message?: string;
        data?: any;
    }): void;
    broadcastPerformanceUpdate(metrics: any): void;
    sendToClient(clientId: string, event: string, data: any): void;
    broadcastSystemNotification(notification: {
        type: 'info' | 'warning' | 'error' | 'success';
        title: string;
        message: string;
        data?: any;
    }): void;
    getConnectedClientsCount(): number;
    getClientsInRoom(room: string): Promise<string[]>;
}
export declare const setWebSocketServiceInstance: (instance: WebSocketService) => void;
export declare const getWebSocketServiceInstance: () => WebSocketService | null;
export declare const webSocketService: {
    broadcastEmailUpdate: (update: any) => void;
};
//# sourceMappingURL=websocketService.d.ts.map