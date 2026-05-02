import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("token").then((stored) => {
      if (stored) setToken(stored);
      setIsLoading(false);
    });
  }, []);

  const login = async (newToken) => {
    await AsyncStorage.setItem("token", newToken);
    setToken(newToken);
  };

  const logout = async () => {
    await AsyncStorage.removeItem("token");
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Returns a handler that, when given an error from an authenticated API call,
// clears the stored token and bounces to the login screen if the server said
// the token was bad (401). Returns true when it handled the error so callers
// can skip showing their own message. Errors without status === 401 pass
// through untouched.
export function useApiErrorHandler() {
  const { logout } = useAuth();
  const router = useRouter();
  return useCallback(
    async (err) => {
      if (err && err.status === 401) {
        await logout();
        router.replace("/");
        return true;
      }
      return false;
    },
    [logout, router],
  );
}
