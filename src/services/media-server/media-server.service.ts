import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MediaServerService {
  private readonly logger = new Logger(MediaServerService.name);
  private readonly apiUrl =
    process.env.MEDIAMTX_API_URL || 'http://localhost:9997';
  private readonly webRtcBaseUrl =
    process.env.MEDIAMTX_WEBRTC_BASE_URL || 'http://localhost:8889';

  /**
   * Registers an RTSP source as a MediaMTX path.
   */
  async registerRtspSource(path: string, rtspUrl: string): Promise<void> {
    const endpoint = `${this.apiUrl.replace(/\/+$/g, '')}/v3/config/paths/add/${encodeURIComponent(path)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: rtspUrl,
        sourceOnDemand: true,
        rtspTransport: 'tcp',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.warn(
        `Failed to register MediaMTX path ${path}: ${response.status} ${body}`,
      );
    }
  }

  /**
   * Removes a MediaMTX path. Failure is logged but does not block stream stop.
   */
  async removePath(path: string): Promise<void> {
    const endpoint = `${this.apiUrl.replace(/\/+$/g, '')}/v3/config/paths/delete/${encodeURIComponent(path)}`;
    const response = await fetch(endpoint, { method: 'DELETE' });

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      this.logger.warn(
        `Failed to remove MediaMTX path ${path}: ${response.status} ${body}`,
      );
    }
  }

  buildPath(deviceId: string): string {
    return `device-${deviceId}`;
  }

  buildWebRtcUrl(path: string): string {
    return `${this.webRtcBaseUrl.replace(/\/+$/g, '')}/${path}/webrtc`;
  }

}
