import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canPromptInstall, isStandalone, onInstallChange, promptInstall } from "@/lib/pwa";

const STEPS = [
  { icon: Smartphone, title: "Android (Chrome)", text: "Tap the ⋮ menu, then “Install app” or “Add to Home screen”." },
  { icon: Smartphone, title: "iPhone / iPad (Safari)", text: "Tap the Share button, scroll down, then “Add to Home Screen”." },
  { icon: Monitor, title: "Windows / Mac (Chrome or Edge)", text: "Click the install icon at the right of the address bar, then “Install”." },
  { icon: Monitor, title: "Mac (Safari 17+)", text: "Choose File → “Add to Dock”." },
];

export function InstallAppButton({ className, variant = "default", size = "default" }: { className?: string; variant?: "default" | "secondary" | "outline"; size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [, force] = useState(0);

  useEffect(() => { setInstalled(isStandalone()); return onInstallChange(() => force((n) => n + 1)); }, []);

  const click = async () => {
    if (canPromptInstall()) {
      const ok = await promptInstall();
      if (ok) toast.success("SaveIQ is installing on your device");
      return;
    }
    setOpen(true);
  };

  if (installed) return null;
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={click}><Download className="size-4" /> Install SaveIQ</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Install SaveIQ on your device</DialogTitle>
            <DialogDescription>Run SaveIQ as its own app from your home screen or desktop — it opens in its own window and keeps working when you're offline.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.title} className="flex gap-3 rounded-md border border-border p-3">
                <s.icon className="mt-0.5 size-5 shrink-0 text-success" />
                <div><p className="text-sm font-semibold">{s.title}</p><p className="text-sm text-muted-foreground">{s.text}</p></div>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-success" /> Installing works on the published app, not inside the editor preview.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
