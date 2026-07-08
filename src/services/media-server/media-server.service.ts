import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MediaServerService {
  private readonly logger = new Logger(MediaServerService.name);
  private readonly apiUrl =
    process.env.MEDIAMTX_API_URL || 'http://localhost:9997';
  private readonly webRtcBaseUrl =
    process.env.MEDIAMTX_WEBRTC_BASE_URL || 'http://localhost:8889';

  /**
   * Đăng ký path trên MediaMTX để thiết bị có thể publish (RECORD) luồng RTSP.
   * Nếu path đã tồn tại thì xóa trước để tránh lỗi 400 Bad Request.
   *
   * TUYỆT ĐỐI không set `source`: nếu cấu hình source, MediaMTX sẽ coi path này
   * là kiểu pull/proxy và từ chối RECORD/ANNOUNCE đến với lỗi 400 Bad Request.
   * Vì thiết bị push trực tiếp vào path này nên path phải giữ nguyên là publish target thuần túy.
   */
  async registerRtspSource(path: string, rtspUrl: string): Promise<void> {
    // Xóa path cũ trước để tránh xung đột "path already exists" do session hết hạn để lại
    await this.removePath(path);

    this.logger.log(`Registering MediaMTX publish path ${path} for ${rtspUrl}`);

    const endpoint = `${this.apiUrl.replace(/\/+$/g, '')}/v3/config/paths/add/${encodeURIComponent(path)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.warn(
        `Failed to register MediaMTX path ${path}: ${response.status} ${body}`,
      );
    }
  }

  /**
   * Xóa một path trên MediaMTX. Nếu lỗi chỉ log lại chứ không chặn việc dừng stream.
   */
  async removePath(path: string): Promise<void> {
    const endpoint = `${this.apiUrl.replace(/\/+$/g, '')}/v3/config/paths/delete/${encodeURIComponent(path)}`;
    const response = await fetch(endpoint, { method: 'DELETE' });

    // Bỏ qua lỗi 404 vì path không tồn tại cũng coi như đã xóa thành công
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
    return `${this.webRtcBaseUrl.replace(/\/+$/g, '')}/${path}/`;
  }

}
