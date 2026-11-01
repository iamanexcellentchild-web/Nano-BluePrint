import { useEffect, useState } from "react";
import { AuthPage } from "@/components/auth-page";
import { BlueprintWorkspace } from "@/components/blueprint-workspace";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "@/hooks/use-theme";
import { currentUser, signOut, type DemoUser } from "@/lib/demo-auth";

export function App() {
  const [user, setUser] = useState<DemoUser | null>(currentUser);
  const theme = useTheme((s) => s.theme);
  useEffect(() => useTheme.getState().init(), []);

  return (
    <>
      {user ? (
        <BlueprintWorkspace
          user={user}
          onSignOut={() => {
            signOut();
            setUser(null);
          }}
        />
      ) : (
        <AuthPage onSignedIn={setUser} />
      )}
      <Toaster theme={theme} position="bottom-center" />
    </>
  );
}
