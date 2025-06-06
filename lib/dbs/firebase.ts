import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import serviceAccount from '../../sample-firebase-keys.json';
import { SessionProps, UserData } from '../../types';

const app = getApps().length
  ? getApp()
  : initializeApp({ credential: cert(serviceAccount as any) });
const db = getFirestore(app);

// Firestore data management functions

// Use setUser for storing global user data (persists between installs)
export async function setUser({ user }: SessionProps) {
    if (!user) return null;

    const { email, id, username } = user;
    const ref = db.collection('user').doc(String(id));
    const data: UserData = { email };

    if (username) {
        data.username = username;
    }

    await ref.set(data, {merge: true });
}

export async function setStore(session: SessionProps) {
    const {
        access_token: accessToken,
        context,
        scope,
        user: { id },
    } = session;
    // Only set on app install or update
    if (!accessToken || !scope) return null;

    const storeHash = context?.split('/')[1] || '';
    const ref = db.collection('store').doc(storeHash);
    const data = { accessToken, adminId: id, scope };

    await ref.set(data);
}

// User management for multi-user apps
// Use setStoreUser for storing store specific variables
export async function setStoreUser(session: SessionProps) {
    const {
        access_token: accessToken,
        context,
        owner,
        sub,
        user: { id: userId },
    } = session;
    if (!userId) return null;

    const contextString = context ?? sub;
    const storeHash = contextString?.split('/')[1] || '';
    const documentId = `${userId}_${storeHash}`; // users can belong to multiple stores
    const ref = db.collection('storeUsers').doc(documentId);
    const storeUser = await ref.get();

    // Set admin (store owner) if installing/ updating the app
    // https://developer.bigcommerce.com/api-docs/apps/guide/users
    if (accessToken) {
        // Create a new admin user if none exists
        if (!storeUser.exists) {
            await ref.set({ storeHash, isAdmin: true });
        } else if (!storeUser.data()?.isAdmin) {
            await ref.update({ isAdmin: true });
        }
    } else {
        // Create a new user if it doesn't exist
        if (!storeUser.exists) {
            await ref.set({ storeHash, isAdmin: owner.id === userId });
        }
    }
}

export async function deleteUser({ context, user, sub }: SessionProps) {
    const contextString = context ?? sub;
    const storeHash = contextString?.split('/')[1] || '';
    const docId = `${user?.id}_${storeHash}`;
    const ref = db.collection('storeUsers').doc(docId);

    await ref.delete();
}

export async function hasStoreUser(storeHash: string, userId: string) {
    if (!storeHash || !userId) return false;

    const docId = `${userId}_${storeHash}`;
    const userDoc = await db.collection('storeUsers').doc(docId).get();

    return userDoc.exists;
}

export async function getStoreToken(storeHash: string) {
    if (!storeHash) return null;
    const storeDoc = await db.collection('store').doc(storeHash).get();

    return storeDoc.data()?.accessToken ?? null;
}

export async function deleteStore({ store_hash: storeHash }: SessionProps) {
    const ref = db.collection('store').doc(storeHash);

    await ref.delete();
}
