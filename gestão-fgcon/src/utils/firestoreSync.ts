import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { createSeedState } from '../data/seedData';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { AppState } from '../types/project';
import {
  extractAppStateFromDoc,
  sanitizeAppStateForFirestore,
} from './firestoreSerializer';

export { extractAppStateFromDoc, sanitizeAppStateForFirestore };

export const WORKSPACE_COLLECTION = 'dados';

export interface WorkspaceBootstrapResult {
  state: AppState;
  source: 'firestore' | 'migrated_local' | 'seed';
}

/**
 * Loads `/dados/{uid}` from Firestore.
 * If the document does not exist yet:
 *  - Migrates `localFallback` (read from localStorage without deleting it), OR
 *  - Seeds a fresh demo state if `localFallback` is null.
 */
export async function loadOrMigrateUserWorkspace(
  uid: string,
  localFallback: AppState | null
): Promise<WorkspaceBootstrapResult> {
  const path = `${WORKSPACE_COLLECTION}/${uid}`;
  const docRef = doc(db, WORKSPACE_COLLECTION, uid);

  let snap;
  try {
    snap = await getDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (snap.exists()) {
    const extracted = extractAppStateFromDoc(snap.data() as Record<string, unknown>);
    if (extracted) {
      return { state: extracted, source: 'firestore' };
    }
  }

  const initialSource: 'migrated_local' | 'seed' = localFallback
    ? 'migrated_local'
    : 'seed';
  const initialState = sanitizeAppStateForFirestore(
    localFallback ?? createSeedState()
  );

  try {
    await setDoc(docRef, {
      ...initialState,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return { state: initialState, source: initialSource };
}

/**
 * Persists the user's AppState into `/dados/{uid}`.
 * Uses `updateDoc` when the document already exists (preserving immutable
 * `ownerId` and `createdAt`), and `setDoc` only if creating for the first time.
 */
export async function saveUserWorkspace(
  uid: string,
  state: AppState,
  docExists: boolean
): Promise<AppState> {
  const path = `${WORKSPACE_COLLECTION}/${uid}`;
  const docRef = doc(db, WORKSPACE_COLLECTION, uid);
  const sanitized = sanitizeAppStateForFirestore(state);

  if (!docExists) {
    try {
      await setDoc(docRef, {
        ...sanitized,
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return sanitized;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  try {
    await updateDoc(docRef, {
      version: sanitized.version,
      project: sanitized.project,
      floors: sanitized.floors,
      rooms: sanitized.rooms,
      entries: sanitized.entries,
      dayMetas: sanitized.dayMetas,
      workers: sanitized.workers,
      attendance: sanitized.attendance,
      roomHeadcounts: sanitized.roomHeadcounts,
      updatedAt: serverTimestamp(),
    });
    return sanitized;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Subscribes to real-time updates on `/dados/{uid}` via Firestore `onSnapshot`
 * so edits made on another device immediately appear in the app.
 */
export function subscribeUserWorkspace(
  uid: string,
  onRemoteState: (state: AppState, hasPendingWrites: boolean) => void,
  onSyncError: (error: Error) => void
): Unsubscribe {
  const path = `${WORKSPACE_COLLECTION}/${uid}`;
  const docRef = doc(db, WORKSPACE_COLLECTION, uid);

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const extracted = extractAppStateFromDoc(
        snapshot.data() as Record<string, unknown>
      );
      if (extracted) {
        onRemoteState(extracted, snapshot.metadata.hasPendingWrites);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onSyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}
