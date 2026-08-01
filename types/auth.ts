export type UserRole = 'ADMIN' | 'DOCTOR' | 'NURSE' | 'RECEPTIONIST' | 'LAB_TECHNICIAN'

export interface User {
  id: string
  email: string
  username: string
  role: UserRole
  status: 'ACTIVE' | 'INACTIVE'
  needsPasswordChange: boolean
  lastLogin?: string
  createdAt: string
  updatedAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface PasswordResetRequest {
  email: string
}

export interface PasswordChangeRequest {
  currentPassword?: string
  newPassword: string
  token?: string
}
