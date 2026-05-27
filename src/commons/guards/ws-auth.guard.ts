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
 * WebSocket Authentication Guard that validates the Bearer token
 * from Socket.IO handshake auth or headers against the database sessions.
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Guards the WebSocket handlers by checking for a valid session token.
   * If the token is valid, it attaches the user data to the socket object.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    // Step-by-step logic: If already authenticated during connection, bypass
    if (client.data && client.data.user) {
      return true;
    }

    const token = this.extractToken(client);
    if (!token) {
      throw new WsException('Unauthorized: Missing credentials');
    }

    try {
      // Step-by-step logic: Lookup active session in the database
      const session = await this.dataSource.getRepository(Session).findOne({
        where: { token },
        relations: ['user'],
      });

      if (!session || session.expiresAt < new Date()) {
        throw new WsException('Unauthorized: Session expired or invalid');
      }

      // Step-by-step logic: Attach user data to client socket
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
   * Helper method to extract token from handshake auth or headers.
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
