import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseConfig } from "../utlis/firebase_config.js";
import { API_BASE_URL } from "../utlis/baseUrl.js";
import { API_ROUTES } from "../utlis/api_routes.js";

const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);
const app = firebaseConfigured
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null;
const auth = app ? getAuth(app) : null;
const database = app ? getFirestore(app) : null;
const SYNC_METADATA_PREFIX = "swingTrader-sync-version:";
const SYNCABLE_KEY = /^(pivot-(watchlist|zone-alerts|alert-history|alert-delivery|chart-notes|sample-trades)|swingTrader-theme|swingTrader-chart-layout-.+)$/;
const MONGO_DATA_KEYS = {
  "pivot-watchlist": "watchlist",
  "pivot-zone-alerts": "alert_rules",
  "pivot-alert-history": "alert_history",
  "pivot-alert-delivery": "alert_delivery",
};

const SyncContext = createContext(null);

function syncableKeys() {
  return Object.keys(window.localStorage).filter((key) => SYNCABLE_KEY.test(key));
}

function keyDocument(collectionReference, key) {
  return doc(collectionReference, encodeURIComponent(key));
}

function readMongoData() {
  return Object.fromEntries(Object.entries(MONGO_DATA_KEYS).map(([storageKey, field]) => {
    try {
      const value = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      return [field, Array.isArray(value) ? value : []];
    } catch (error) {
      console.warn(`Ignoring invalid local data for ${storageKey}.`, error);
      return [field, []];
    }
  }));
}

function mongoDataSnapshot(data) {
  return JSON.stringify(data);
}

async function requestMongoWorkspace(user, method, body) {
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}${API_ROUTES.USER_DATA}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || `MongoDB workspace request failed (${response.status}).`);
  }
  return payload;
}

export function notifySyncableDataChanged(key) {
  window.dispatchEvent(new CustomEvent("swingTrader:local-data-changed", { detail: { key } }));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [firebaseSyncReadyUid, setFirebaseSyncReadyUid] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [syncStatus, setSyncStatus] = useState(firebaseConfigured ? "Sign in to sync your data" : "Google sync needs setup");
  const [syncError, setSyncError] = useState("");
  const [mongoSyncStatus, setMongoSyncStatus] = useState("Sign in to sync MongoDB data");
  const [mongoSyncError, setMongoSyncError] = useState("");

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      setFirebaseSyncReadyUid(null);
      setUser(nextUser);
      setAuthReady(true);
      setSyncError("");
      setSyncStatus(nextUser ? "Connecting your workspace…" : "Sign in to sync your data");
      setMongoSyncError("");
      setMongoSyncStatus(nextUser ? "Connecting…" : "Sign in to sync MongoDB data");
    }, (error) => {
      setAuthReady(true);
      setSyncError(error.message || "Unable to check Google sign-in.");
      setSyncStatus("Google sign-in unavailable");
    });
  }, []);

  useEffect(() => {
    if (!user || !database) {
      setFirebaseSyncReadyUid(null);
      return undefined;
    }
    setFirebaseSyncReadyUid(null);
    let active = true;
    let ready = false;
    let unsubscribe = () => {};
    let timer;
    const collectionReference = collection(database, "users", user.uid, "syncData");

    const writeKey = async (key) => {
      const rawValue = window.localStorage.getItem(key);
      if (rawValue == null) return;
      const localVersion = Number(window.localStorage.getItem(`${SYNC_METADATA_PREFIX}${key}`) || 0);
      const updatedAt = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), localVersion + 1);
      await setDoc(keyDocument(collectionReference, key), {
        key,
        value: rawValue,
        updatedAt,
      });
      window.localStorage.setItem(`${SYNC_METADATA_PREFIX}${key}`, String(updatedAt));
    };

    const applyRemoteValue = (key, rawValue, updatedAt) => {
      window.localStorage.setItem(key, rawValue);
      window.localStorage.setItem(`${SYNC_METADATA_PREFIX}${key}`, String(updatedAt));
      window.dispatchEvent(new CustomEvent("swingTrader:cloud-data-updated", { detail: { key } }));
    };

    const syncInitialData = async () => {
      try {
        const remoteSnapshot = await getDocs(collectionReference);
        if (!active) return;
        const remoteByKey = new Map(
          remoteSnapshot.docs.map((snapshot) => [snapshot.data().key, snapshot.data()]),
        );
        const keys = new Set([...syncableKeys(), ...remoteByKey.keys()]);
        const uploads = [];

        for (const key of keys) {
          const localValue = window.localStorage.getItem(key);
          const localVersion = Number(window.localStorage.getItem(`${SYNC_METADATA_PREFIX}${key}`) || 0);
          const remote = remoteByKey.get(key);
          const remoteVersion = Number(remote?.updatedAt || 0);

          if (remote && (localVersion === 0 || remoteVersion > localVersion)) {
            if (typeof remote.value === "string") applyRemoteValue(key, remote.value, remoteVersion);
          } else if (localValue != null) {
            uploads.push(writeKey(key));
          }
        }

        await Promise.all(uploads);
        if (!active) return;
        ready = true;
        setFirebaseSyncReadyUid(user.uid);
        setSyncStatus("Synced with Google");

        unsubscribe = onSnapshot(collectionReference, (snapshot) => {
          if (!active || !ready) return;
          snapshot.docChanges().forEach((change) => {
            if (change.type === "removed") return;
            const remote = change.doc.data();
            if (typeof remote.key !== "string" || typeof remote.value !== "string") return;
            const localVersion = Number(window.localStorage.getItem(`${SYNC_METADATA_PREFIX}${remote.key}`) || 0);
            const remoteVersion = Number(remote.updatedAt || 0);
            if (remoteVersion > localVersion) {
              applyRemoteValue(remote.key, remote.value, remoteVersion);
            }
          });
          setSyncStatus("Synced with Google");
        }, (error) => {
          if (!active) return;
          setSyncError(error.message || "Unable to sync your workspace.");
          setSyncStatus("Sync failed");
        });

        const queueSync = (event) => {
          if (!ready) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(async () => {
            try {
              const changedKey = event?.detail?.key;
              const keysToWrite = changedKey && SYNCABLE_KEY.test(changedKey)
                ? [changedKey]
                : syncableKeys();
              await Promise.all(keysToWrite.map(writeKey));
              if (active) {
                setSyncError("");
                setSyncStatus("Synced with Google");
              }
            } catch (error) {
              if (!active) return;
              setSyncError(error.message || "Unable to save workspace changes.");
              setSyncStatus("Sync failed");
            }
          }, 500);
        };
        window.addEventListener("swingTrader:local-data-changed", queueSync);
        window.addEventListener("storage", queueSync);
        unsubscribe = (() => {
          const stopSnapshot = unsubscribe;
          return () => {
            stopSnapshot();
            window.removeEventListener("swingTrader:local-data-changed", queueSync);
            window.removeEventListener("storage", queueSync);
          };
        })();
      } catch (error) {
        if (!active) return;
        setSyncError(error.message || "Unable to sync your workspace.");
        setSyncStatus("Sync failed");
        setFirebaseSyncReadyUid(user.uid);
      }
    };

    syncInitialData();
    return () => {
      active = false;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !database || firebaseSyncReadyUid !== user.uid) return undefined;
    let active = true;
    let ready = false;
    let connecting = false;
    let saveQueue = Promise.resolve();
    let timer;
    const versionKey = `swingTrader-mongodb-version:${user.uid}`;
    const snapshotKey = `swingTrader-mongodb-snapshot:${user.uid}`;

    const saveLocalData = async (data, force = false, minimumVersion = 0) => {
      const snapshot = mongoDataSnapshot(data);
      if (!force && snapshot === window.localStorage.getItem(snapshotKey)) return;
      const currentVersion = Number(window.localStorage.getItem(versionKey) || 0);
      const updatedAt = Math.max(
        Date.now() * 1000 + Math.floor(Math.random() * 1000),
        currentVersion + 1,
        minimumVersion + 1,
      );
      const response = await requestMongoWorkspace(user, "PUT", { ...data, updated_at: updatedAt });
      const responseVersion = Number(response.updated_at || 0);
      const responseSnapshot = mongoDataSnapshot(response.data || {});

      if (responseSnapshot !== snapshot) {
        throw new Error("MongoDB has a newer workspace version; waiting for Google sync.");
      }
      window.localStorage.setItem(versionKey, String(responseVersion));
      window.localStorage.setItem(snapshotKey, snapshot);
      setMongoSyncError("");
      setMongoSyncStatus("Synced to MongoDB");
    };

    const connect = async () => {
      if (connecting) return;
      connecting = true;
      setMongoSyncStatus("Connecting to MongoDB…");
      try {
        const remote = await requestMongoWorkspace(user, "GET");
        if (!active) return;
        const remoteVersion = Number(remote.updated_at || 0);
        const localData = readMongoData();
        const localSnapshot = mongoDataSnapshot(localData);
        const remoteSnapshot = mongoDataSnapshot(remote.data || {});

        if (localSnapshot !== remoteSnapshot) {
          await saveLocalData(localData, true, remoteVersion);
        } else {
          window.localStorage.setItem(versionKey, String(remoteVersion));
          window.localStorage.setItem(snapshotKey, remoteSnapshot);
          setMongoSyncError("");
          setMongoSyncStatus("Synced to MongoDB");
        }
        ready = true;
      } catch (error) {
        if (!active) return;
        setMongoSyncError(error.message || "Unable to connect to MongoDB.");
        setMongoSyncStatus("MongoDB sync unavailable");
        ready = true;
      } finally {
        connecting = false;
      }
      if (ready) await syncIfChanged();
    };

    const enqueueSync = (data) => {
      saveQueue = saveQueue.catch(() => {}).then(() => saveLocalData(data));
      return saveQueue;
    };

    const syncIfChanged = async () => {
      if (!ready) return;
      try {
        await enqueueSync(readMongoData());
      } catch (error) {
        if (!active) return;
        setMongoSyncError(error.message || "Unable to save workspace data to MongoDB.");
        setMongoSyncStatus("MongoDB sync unavailable");
      }
    };

    const queueSync = (event) => {
      const changedKey = event?.detail?.key || event?.key;
      if (changedKey && !Object.prototype.hasOwnProperty.call(MONGO_DATA_KEYS, changedKey)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(syncIfChanged, 500);
    };

    window.addEventListener("swingTrader:local-data-changed", queueSync);
    window.addEventListener("swingTrader:cloud-data-updated", queueSync);
    window.addEventListener("storage", queueSync);
    connect();
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("swingTrader:local-data-changed", queueSync);
      window.removeEventListener("swingTrader:cloud-data-updated", queueSync);
      window.removeEventListener("storage", queueSync);
    };
  }, [user, firebaseSyncReadyUid]);

  const value = useMemo(() => ({
    user,
    firebaseSyncReady: firebaseSyncReadyUid === user?.uid,
    authReady,
    configured: firebaseConfigured,
    syncStatus,
    syncError,
    mongoSyncStatus,
    mongoSyncError,
    async signIn() {
      if (!auth) {
        const error = new Error("Google sync is not configured. Add the Firebase settings from the README.");
        setSyncError(error.message);
        throw error;
      }
      setSyncError("");
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (error) {
        setSyncError(error.message || "Google sign-in failed.");
        throw error;
      }
    },
    async signOutUser() {
      if (!auth) return;
      try {
        await signOut(auth);
      } catch (error) {
        setSyncError(error.message || "Unable to sign out.");
        throw error;
      }
    },
  }), [user, authReady, firebaseSyncReadyUid, syncStatus, syncError, mongoSyncStatus, mongoSyncError]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useCloudSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useCloudSync must be used inside AuthProvider.");
  return context;
}
