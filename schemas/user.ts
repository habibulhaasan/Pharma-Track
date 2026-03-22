// schemas/user.ts
import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "user"]);
export const UserStatusSchema = z.enum(["pending", "active", "disabled"]);

export const RegisterSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name too long"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
  phone: z
    .string()
    .min(7, "Phone number too short")
    .max(20, "Phone number too long")
    .regex(/^[+\d\s\-()]+$/, "Invalid phone number format"),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const UpdateUserStatusSchema = z.object({
  userId: z.string().min(1, "User ID required"),
  status: UserStatusSchema,
});

export const UserDocSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  createdAt: z.any(), // Firestore Timestamp
  lastLoginAt: z.any().optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>;
export type UserDoc = z.infer<typeof UserDocSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type UserStatus = z.infer<typeof UserStatusSchema>;
