// utils/errorHandler.ts
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public message: string,
    public code: string = "INTERNAL_ERROR",
    public statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class InsufficientStockError extends AppError {
  constructor(productName?: string) {
    super(
      productName
        ? `Insufficient stock for ${productName}`
        : "Insufficient stock",
      "INSUFFICIENT_STOCK",
      400
    );
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string[]>
  ) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

// ─── Format Zod errors for API responses ──────────────────────────────────
export function formatZodError(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path].push(issue.message);
  }
  return fieldErrors;
}

// ─── Standard server action error handler ─────────────────────────────────
export function handleActionError(error: unknown): {
  success: false;
  error: string;
  errors?: Record<string, string[]>;
} {
  if (error instanceof ZodError) {
    return {
      success: false,
      error: "Validation failed",
      errors: formatZodError(error),
    };
  }

  if (error instanceof AppError) {
    return {
      success: false,
      error: error.message,
    };
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return { success: false, error: "You must be logged in" };
    }
    if (error.message === "FORBIDDEN") {
      return { success: false, error: "You don't have permission" };
    }
    return { success: false, error: error.message };
  }

  return { success: false, error: "An unexpected error occurred" };
}
