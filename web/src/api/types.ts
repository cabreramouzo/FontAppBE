// Tipos del contrato de la API — ver ../../../docs/api.md.

export interface Font {
  id: string
  name: string
  latitude: number
  longitude: number
  image: string | null
  description: string | null
  createdAt: string
}

export interface UserResponse {
  id: string
  name: string
  username: string
}

export interface LoginResponse {
  token: string
  expiresAt: string | null
  user: UserResponse
}

export interface ReportResponse {
  id: string
  fontID: string
  userID: string | null
  username: string | null
  message: string
  createdAt: string
}

export interface CommentResponse {
  id: string
  fontID: string
  userID: string | null
  username: string | null
  body: string
  createdAt: string
}

export interface Page<T> {
  items: T[]
  metadata: { total: number; per: number; page: number }
}
