/**
 * Enum representing user roles in the system
 */
export enum Role {
  /** Administrator - has full permissions in the system */
  ADMIN = 'admin',
  /** Regular user */
  USER = 'user',
  /** Merchant user */
  MERCHANT = 'merchant',
  /** Clinic user */
  CLINIC = 'clinic',
}

/**
 * Enum representing user account statuses
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BANNED = 'banned',
}

/**
 * Enum representing merchant account statuses
 */
export enum MerchantStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  REJECTED = 'rejected',
}

/**
 * Enum representing clinic statuses
 */
export enum ClinicStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  REJECTED = 'rejected',
}
