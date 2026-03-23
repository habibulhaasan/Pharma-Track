// app/register/page.tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Pill, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { registerUserDocAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setFieldErrors({}); setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const phone = formData.get("phone") as string;

    startTransition(async () => {
      try {
        // Step 1: Create Firebase Auth user (client SDK — runs in browser)
        const credential = await createUserWithEmailAndPassword(auth, email, password);

        // Step 2: Create Firestore user doc via server action (status: pending)
        const result = await registerUserDocAction(credential.user.uid, { name, email, phone });

        if (result.success) {
          setSuccess(true);
          toast.success("Registration submitted!");
        } else {
          setError((result as any).error ?? "Registration failed");
          if ((result as any).errors) setFieldErrors((result as any).errors);
          // If doc creation failed, clean up the Auth user to avoid orphans
          try { await credential.user.delete(); } catch { /* ignore */ }
        }
      } catch (err: any) {
        const code = err?.code ?? "";
        if (code === "auth/email-already-in-use") {
          setError("An account with this email already exists");
        } else if (code === "auth/weak-password") {
          setError("Password must be at least 6 characters");
        } else if (code === "auth/invalid-email") {
          setError("Invalid email address");
        } else {
          setError("Something went wrong. Please try again.");
        }
      }
    });
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background px-4">
        <Card className="w-full max-w-sm text-center shadow-md">
          <CardContent className="pt-8 pb-6 px-6">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-14 w-14 text-success" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Registration Submitted</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your account is pending admin approval. You&apos;ll be able to log in once
              an administrator approves your account.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Back to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-lg">
            <Pill className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">PharmaTrack</h1>
          <p className="text-sm text-muted-foreground">Create your account</p>
        </div>

        <Card className="shadow-md">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">Request Access</CardTitle>
            <CardDescription>An admin will review and approve your account</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name" name="name" required
                  placeholder="Dr. Jane Doe"
                  error={fieldErrors.name?.[0]}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email" name="email" type="email" required
                  placeholder="you@example.com"
                  error={fieldErrors.email?.[0]}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone" name="phone" type="tel" required
                  placeholder="+880 1XXX-XXXXXX"
                  error={fieldErrors.phone?.[0]}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password" name="password" required
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    className="pr-9"
                    error={fieldErrors.password?.[0]}
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-3 pt-2">
              <Button type="submit" className="w-full" loading={isPending}>
                {isPending ? "Submitting…" : "Request Access"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}