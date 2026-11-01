import { useState, type FormEvent } from "react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signIn, signUp, type DemoUser } from "@/lib/demo-auth";

type Mode = "signin" | "signup";

export function AuthPage({ onSignedIn }: { onSignedIn: (user: DemoUser) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      onSignedIn(mode === "signup" ? signUp(name, email, password) : signIn(email, password));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="dot-grid grid min-h-dvh place-items-center bg-background p-5">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border bg-card p-7 shadow-xl"
      >
        <Brand />
        <h1 className="mt-2 text-xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="-mt-1 text-xs text-muted-foreground">
          {mode === "signin" ? "Sign in to open your workspace." : "Start modeling your logic in minutes."}
        </p>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            setError("");
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "signup" && (
          <Label className="grid gap-1.5 text-xs">
            Full name
            <Input required value={name} autoComplete="name" placeholder="Ada Kalu" onChange={(e) => setName(e.target.value)} />
          </Label>
        )}
        <Label className="grid gap-1.5 text-xs">
          Email
          <Input required type="email" value={email} autoComplete="email" placeholder="you@company.com" onChange={(e) => setEmail(e.target.value)} />
        </Label>
        <Label className="grid gap-1.5 text-xs">
          Password
          <Input
            required
            type="password"
            value={password}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Label>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-1">
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Demo mode: accounts are saved in this browser only.
        </p>
      </form>
    </main>
  );
}
