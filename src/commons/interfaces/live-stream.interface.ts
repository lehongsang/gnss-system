export enum LiveStreamStatus {
  STARTING = 'starting',
  READY = 'ready',
  FAILED = 'failed',
  STOPPED = 'stopped',
}

export interface LiveStreamSession {
  requestId: string;
  deviceId: string;
  status: LiveStreamStatus;
  rtspUrl: string | null;
  webrtcUrl: string | null;
  startedBy: string;
  startedAt: string;
  expiresAt: string;
  errorMessage?: string;
}

export interface DeviceStreamStatusPayload {
  requestId: string;
  status: LiveStreamStatus.READY | LiveStreamStatus.FAILED | LiveStreamStatus.STOPPED;
  rtspUrl?: string;
  errorMessage?: string;
  timestamp?: string;
}
