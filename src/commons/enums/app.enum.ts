/**
 * Enum representing user roles in the system
 */
export enum Role {
  /** Administrator - has full permissions in the system */
  ADMIN = 'admin',
  /** Regular user */
  USER = 'user',
}
export const ALL_ROLES = [Role.USER, Role.ADMIN];

/**
 * Enum representing user account statuses
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BANNED = 'banned',
}

export enum AccuracyStatus {
  GNSS_ONLY = 'gnss_only',
  VISION_ONLY = 'vision_only',
  FUSED = 'fused',
}

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}