import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export function useUserData<T>(
  userId: string,
  collectionName: string,
  defaultValue: T
): [T, (data: T) => Promise<void>, boolean] {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const ref = doc(db, "users", userId, collectionName, "data");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setData(snap.data() as T);
      } else {
        setData(defaultValue);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [userId, collectionName]);

  const save = async (newData: T) => {
    const ref = doc(db, "users", userId, collectionName, "data");
    await setDoc(ref, newData as object);
  };

  return [data, save, loading];
}