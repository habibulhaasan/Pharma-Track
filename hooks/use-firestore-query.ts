"use client";
// hooks/use-firestore-query.ts
// Client-side Firestore query hook — React 19 compatible
import { useEffect, useState, useRef } from "react";
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Options {
  /** Subscribe to real-time updates (default: true) */
  realtime?: boolean;
  /** Disable the query entirely (useful for conditional fetching) */
  enabled?: boolean;
}

export function useFirestoreQuery<T = DocumentData>(
  collectionPath: string,
  constraints: QueryConstraint[] = [],
  options: Options = {}
) {
  const { realtime = true, enabled = true } = options;

  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  // Stable ref for constraints so the effect doesn't re-run on every render
  const constraintsRef = useRef(constraints);
  constraintsRef.current = constraints;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(collection(db, collectionPath), ...constraintsRef.current);

    if (realtime) {
      const unsub = onSnapshot(
        q,
        (snap) => {
          setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T & { id: string })));
          setLoading(false);
        },
        (err) => {
          setError(err);
          setLoading(false);
        }
      );
      return () => unsub();
    } else {
      getDocs(q)
        .then((snap) => {
          setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T & { id: string })));
          setLoading(false);
        })
        .catch((err) => {
          setError(err);
          setLoading(false);
        });
    }
  }, [collectionPath, realtime, enabled]); // constraints excluded intentionally — use constraintsRef

  function refetch() {
    setLoading(true);
    const q = query(collection(db, collectionPath), ...constraintsRef.current);
    getDocs(q)
      .then((snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T & { id: string })));
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }

  return { data, loading, error, refetch };
}
