import { z } from 'zod';

export const TeacherLoginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export interface TeacherAuthPayload {
  role: 'teacher';
  iat: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  message?: string;
}
