import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: '*', // ⚠️ solo en pruebas / desarrollo
        credentials: true,
    },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    // Mapa userId -> socketId
    private users = new Map<string, string>();


    handleConnection(@ConnectedSocket() client: Socket) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                client.disconnect();
                return;
            }

            const payload = jwt.verify(token, process.env.JWT_SECRET);
            const userId = String((payload as any).sub);

            // Elimina cualquier socketId viejo asociado a este userId
            this.users.delete(userId);

            this.users.set(userId, client.id);
            console.log(`Usuario autenticado: ${userId}, socketId: ${client.id}`);
            console.log("Usuarios conectados:", [...this.users.entries()]);

        } catch (error) {
            console.log("Token inválido, desconectando");
            client.disconnect();
        }
    }

    handleDisconnect(@ConnectedSocket() client: Socket) {
        const userId = [...this.users.entries()].find(([_, id]) => id === client.id)?.[0];
        if (userId) {
            this.users.delete(userId);
            console.log(`Usuario desconectado: ${userId}`);
        }
    }

    @SubscribeMessage('private-message')
    handlePrivateMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody()
        data: { toUserId: string; message: string },
    ) {
        console.log('Mensaje privado recibido:', data);

        const receiverSocketId = this.users.get(data.toUserId);
        if (!receiverSocketId) {
            console.log(`Usuario receptor ${data.toUserId} no conectado`);
            return;
        }

        const fromUserId = [...this.users.entries()].find(([userId, socketId]) => socketId === client.id)?.[0] || 'unknown';

        this.server.to(receiverSocketId).emit('private-message', {
            from: fromUserId,
            message: data.message,
        });

        console.log(`Mensaje enviado de ${fromUserId} a ${data.toUserId}`);
    }

}
