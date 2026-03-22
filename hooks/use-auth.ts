"use client";
// hooks/use-auth.ts
// Client-side auth state hook using Firebase client SDK (not admin)
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export interface AuthUser {
  uid: string;
  email: string | null;
  name: string;
  role: "admin" | "user";
  status: "pending" | "active" | "disabled";
  phone: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Listen to the Firestore user doc for real-time role/status changes
      const unsubDoc = onSnapshot(
        doc(db, "users", firebaseUser.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: data.name as string,
              role: data.role as "admin" | "user",
              status: data.status as "pending" | "active" | "disabled",
              phone: data.phone as string,
            });
          } else {
            setUser(null);
          }
          setLoading(false);
        },
        () => {
          setUser(null);
          setLoading(false);
        }
      );

      return () => unsubDoc();
    });

    return () => unsubAuth();
  }, []);

  return { user, loading, isAdmin: user?.role === "admin" };
}
