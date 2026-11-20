import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type UserCredential,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as Partial<FirestoreErrorInfo>;
      if (parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      // Not a serialized FirestoreErrorInfo JSON payload
    }
    return error.message;
  }
  return String(error);
}

export function isQuotaExceededError(error: unknown): boolean {
  const msg = extractRawErrorMessage(error).toLowerCase();
  return msg.includes('quota exceeded') || msg.includes('resource-exhausted');
}

export function getFriendlyFirestoreErrorMessage(
  error: unknown,
  action: 'load' | 'save' | 'sync'
): string {
  const raw = extractRawErrorMessage(error);
  const lower = raw.toLowerCase();

  if (isQuotaExceededError(error)) {
    return 'Limite diário gratuito do Firebase atingido (Quota exceeded). A cota reinicia às 00h (horário do Pacífico) ou pode ser ampliada no console do Firebase.';
  }
  if (lower.includes('offline') || lower.includes('network') || lower.includes('unavailable')) {
    return action === 'save'
      ? 'Sem conexão com o servidor. Não foi possível salvar as alterações no Firebase; verifique sua internet e tente novamente.'
      : 'Sem conexão com o Firebase. Verifique sua internet e tente novamente.';
  }
  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return action === 'save'
      ? 'Permissão negada ao salvar no Firebase. Verifique se sua conta Google está autenticada e tente novamente.'
      : 'Permissão negada ao acessar os dados no Firebase. Tente sair e entrar novamente com sua conta Google.';
  }

  if (action === 'save') {
    return `Não foi possível salvar os dados no Firebase (${raw}). Tente novamente.`;
  }
  if (action === 'sync') {
    return `Falha na sincronização em tempo real com o Firebase (${raw}).`;
  }
  return `Erro ao carregar os dados da obra no Firebase (${raw}).`;
}

export function getFriendlyAuthErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'A janela de login com Google foi fechada antes da conclusão. Tente novamente.';
  }
  if (code === 'auth/popup-blocked') {
    return 'O navegador bloqueou a janela pop-up de login. Permita pop-ups para este site e tente novamente.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Falha de conexão ao autenticar com o Google. Verifique sua internet e tente novamente.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Este domínio ainda não está autorizado na autenticação do Firebase.';
  }
  return `Não foi possível concluir o login com Google (${code || msg}).`;
}

export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser(): Promise<void> {
  return signOut(auth);
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. ');
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}

void testConnection();
