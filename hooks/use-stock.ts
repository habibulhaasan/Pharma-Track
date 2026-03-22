"use client";
// hooks/use-stock.ts
// Real-time stock level listener for a single product
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function useStockLevel(
  productId: string | null | undefined,
  type: "main" | "pharmacy"
) {
  const [quantity, setQuantity] = useState<number | null>(null);
  const [loading, setLoading] = useState(!!productId);

  useEffect(() => {
    if (!productId) {
      setQuantity(null);
      setLoading(false);
      return;
    }

    const collectionName = type === "main" ? "mainStock" : "pharmacyStock";
    setLoading(true);

    const unsub = onSnapshot(
      doc(db, collectionName, productId),
      (snap) => {
        setQuantity(snap.exists() ? (snap.data()?.quantity as number) ?? 0 : 0);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsub();
  }, [productId, type]);

  return { quantity, loading };
}
