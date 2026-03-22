// utils/date.ts
// Safe for both client and server — no firebase-admin import here.
// Handles Firestore Timestamps from both client SDK and Admin SDK via duck-typing.
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

type FirestoreTimestamp = { toDate: () => Date; seconds: number; nanoseconds: number };

export function toDate(
  value: FirestoreTimestamp | Date | string | number | null | undefined
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === "number") return new Date(value * 1000); // Unix seconds
  if (typeof value === "string") {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  }
  // Firestore Timestamp (client or admin) — duck-typed, no import needed
  if (typeof (value as FirestoreTimestamp).toDate === "function") {
    return (value as FirestoreTimestamp).toDate();
  }
  return null;
}

export function formatDate(
  value: FirestoreTimestamp | Date | string | number | null | undefined,
  fmt = "dd MMM yyyy"
): string {
  const date = toDate(value);
  if (!date) return "—";
  return format(date, fmt);
}

export function formatDateTime(
  value: FirestoreTimestamp | Date | string | number | null | undefined
): string {
  return formatDate(value, "dd MMM yyyy, HH:mm");
}

export function formatRelative(
  value: FirestoreTimestamp | Date | string | number | null | undefined
): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function toISODateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
