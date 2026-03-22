"use server";
// app/actions/users.ts
import { requireAdmin } from "@/lib/auth";
import { updateUserStatus } from "@/services/userService";
import { UpdateUserStatusSchema } from "@/schemas/user";
import { handleActionError } from "@/utils/errorHandler";

export async function approveUserAction(data: unknown) {
  try {
    const admin = await requireAdmin();
    const validated = UpdateUserStatusSchema.parse(data);
    await updateUserStatus(validated.userId, "active", admin.id);
    return { success: true, message: "User approved successfully" };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function disableUserAction(data: unknown) {
  try {
    const admin = await requireAdmin();
    const validated = UpdateUserStatusSchema.parse({ ...data as any, status: "disabled" });
    await updateUserStatus(validated.userId, "disabled", admin.id);
    return { success: true, message: "User disabled successfully" };
  } catch (error) {
    return handleActionError(error);
  }
}
