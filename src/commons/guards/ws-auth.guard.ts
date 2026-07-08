import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { DataSource } from 'typeorm';
import { Session } from '@/modules/auth/entities/session.entity';

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: {
      id: string;
      role: string;
      email: string;
    };
    [key: string]: unknown;
  };
}

/**
 * Guard xác thực WebSocket, kiểm tra Bearer token
 * lấy từ handshake auth hoặc headers của Socket.IO với session trong database.
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Bảo vệ các handler WebSocket bằng cách kiểm tra session token hợp lệ.
   * Nếu token hợp lệ thì gắn thông tin user vào socket.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    // Nếu đã xác thực sẵn từ lúc connect thì bỏ qua, không cần check lại
    if (client.data && client.data.user) {
      return true;
    }

    const token = this.extractToken(client);
    if (!token) {
      throw new WsException('Unauthorized: Missing credentials');
    }

    try {
      // Tìm session còn hiệu lực trong database
      const session = await this.dataSource.getRepository(Session).findOne({
        where: { token },
        relations: ['user'],
      });

      if (!session || session.expiresAt < new Date()) {
        throw new WsException('Unauthorized: Session expired or invalid');
      }

      // Gắn thông tin user vào socket của client
      client.data = {
        ...client.data,
        user: {
          id: session.user.id,
          role: session.user.role,
          email: session.user.email,
        },
      };

      return true;
    } catch {
      throw new WsException('Unauthorized');
    }
  }

  /**
   * Hàm hỗ trợ lấy token từ handshake auth hoặc headers.
   */
  private extractToken(client: Socket): string | null {
    const authHeader: unknown =
      client.handshake.auth?.token || client.handshake.headers?.authorization;

    if (typeof authHeader !== 'string') {
      return null;
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return authHeader;
  }
}
