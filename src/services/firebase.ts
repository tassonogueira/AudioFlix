import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Inicialização do Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Instância de Autenticação Oficial do Google
export const auth = getAuth(app);

// Provider do Google com prompt forçado de seleção de conta
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Instância do Cloud Firestore com o databaseId configurado
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Validação de conexão conforme padrão do Firebase SDK
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Verifique a conexão do Firebase Firestore.');
    }
  }
}
testConnection();

/**
 * Autentica o usuário abrindo o popup oficial de Login / Confirmação da Conta Google
 */
export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Encerra a sessão da Conta Google
 */
export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

/**
 * Salva os dados de música do usuário (favoritas, playlists, downloads) no Firestore
 */
export async function syncUserDataToFirestore(
  userId: string,
  data: {
    favorites: any[];
    playlists: any[];
    downloads: any[];
  }
) {
  try {
    const userRef = doc(db, 'users', userId, 'musicData', 'main');
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2500));
    const writePromise = setDoc(
      userRef,
      {
        userId,
        favorites: JSON.stringify(data.favorites || []),
        playlists: JSON.stringify(data.playlists || []),
        downloads: JSON.stringify(data.downloads || []),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    await Promise.race([writePromise, timeoutPromise]);
  } catch (err) {
    console.warn('Aviso ao sincronizar dados com o Firestore:', err);
  }
}

/**
 * Recupera os dados salvos do usuário no Firestore (com timeout seguro de 2.5s)
 */
export async function loadUserDataFromFirestore(userId: string) {
  try {
    const userRef = doc(db, 'users', userId, 'musicData', 'main');
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    const readPromise = (async () => {
      const snap = await getDoc(userRef);
      if (!snap.exists()) return null;
      const d = snap.data();
      return {
        favorites: d.favorites ? JSON.parse(d.favorites) : [],
        playlists: d.playlists ? JSON.parse(d.playlists) : [],
        downloads: d.downloads ? JSON.parse(d.downloads) : [],
        updatedAt: d.updatedAt
      };
    })();
    return await Promise.race([readPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Aviso ao carregar dados do Firestore:', err);
    return null;
  }
}

export { onAuthStateChanged };
export type { User };
