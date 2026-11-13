import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// Environment variable extraction with Vite support
const supabaseUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
  ? import.meta.env.VITE_SUPABASE_URL
  : '';

const supabaseAnonKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY
  ? import.meta.env.VITE_SUPABASE_ANON_KEY
  : '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder')
  );
};

let clientInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  }
  return clientInstance;
};

export interface SupabaseAuthResult {
  success: boolean;
  user?: User | null;
  session?: Session | null;
  error?: string;
}

/**
 * Sign in with Supabase Authentication (Email & Password)
 */
export async function supabaseSignIn(email: string, password: string): Promise<SupabaseAuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase credentials not configured. Running in local clinical session mode.'
    };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      user: data.user,
      session: data.session
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Authentication failed' };
  }
}

/**
 * Sign up a new staff or patient account in Supabase
 */
export async function supabaseSignUp(
  email: string,
  password: string,
  metadata?: { name?: string; role?: string; mrn?: string }
): Promise<SupabaseAuthResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      error: 'Supabase credentials not configured.'
    };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: metadata || {}
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      user: data.user,
      session: data.session
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Registration failed' };
  }
}

/**
 * Sign out of active Supabase session
 */
export async function supabaseSignOut(): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: true };
  }

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Sign out failed' };
  }
}

/**
 * Retrieve current Supabase session
 */
export async function supabaseGetSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data } = await client.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

/**
 * Get current JWT access token for authorization headers
 */
export async function supabaseGetAccessToken(): Promise<string | null> {
  const session = await supabaseGetSession();
  return session?.access_token || null;
}

/**
 * Listen to auth state transitions
 */
export function supabaseOnAuthStateChange(
  callback: (event: string, session: Session | null) => void
): { unsubscribe: () => void } {
  const client = getSupabaseClient();
  if (!client) {
    return { unsubscribe: () => {} };
  }

  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return {
    unsubscribe: () => subscription.unsubscribe()
  };
}
