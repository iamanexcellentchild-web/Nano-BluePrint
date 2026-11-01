import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE, DEMO_MODE, getToken, setToken } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useWorkspace } from "@/lib/store";

export function SettingsDialog() {
  const open = useWorkspace((s) => s.dialog === "settings");
  const setDialog = useWorkspace((s) => s.setDialog);
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog(o ? "settings" : null)}>
      <DialogContent className="max-w-md">{open && <SettingsBody />}</DialogContent>
    </Dialog>
  );
}

function DemoBody() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Demo mode is on. Projects, checks, simulations, code and AI replies all run in this browser, so there is no
          token to set.
        </DialogDescription>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">
        To use the real backend, set <code className="font-mono">VITE_DEMO_MODE=false</code> in <code className="font-mono">.env</code>{" "}
        and restart the dev server. Then this dialog asks for your API token.
      </p>
    </>
  );
}

function SettingsBody() {
  if (DEMO_MODE) return <DemoBody />;
  return <ApiBody />;
}

function ApiBody() {
  const status = useWorkspace((s) => s.status);
  const [token, setTokenValue] = useState(getToken);
  const [show, setShow] = useState(false);

  const save = () => {
    setToken(token);
    useWorkspace.getState().setDialog(null);
    notify(token.trim() ? "API token saved" : "API token cleared");
    void useWorkspace.getState().boot(); // re-check the connection with the new token
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Blueprint talks to your backend with a token. It’s kept in this browser only.
        </DialogDescription>
      </DialogHeader>

      <Label className="grid gap-1.5 text-xs text-muted-foreground">
        API token
        <div className="flex gap-1.5">
          <Input
            type={show ? "text" : "password"}
            value={token}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your token"
            className="text-foreground"
            onChange={(e) => setTokenValue(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={show ? "Hide token" : "Show token"}
            onClick={() => setShow((v) => !v)}
          >
            {show ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </Label>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">API address</dt>
        <dd className="font-mono">{API_BASE}</dd>
        <dt className="text-muted-foreground">Connection</dt>
        <dd>{status === "ready" ? "Connected" : status === "booting" ? "Connecting…" : "Not connected"}</dd>
      </dl>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => setTokenValue("")}>
          Clear
        </Button>
        <Button onClick={save}>Save &amp; reconnect</Button>
      </DialogFooter>
    </>
  );
}
