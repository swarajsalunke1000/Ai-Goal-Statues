import { useState, type FormEvent } from "react";
import { ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InstallAppButton } from "@/components/InstallApp";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check your details"); return; }
    if (mode === "signup" && name.trim().length < 2) { toast.error("Enter your name"); return; }
    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email, password: parsed.data.password,
        options: { emailRedirectTo: window.location.origin, data: { display_name: name.trim().slice(0, 60) } },
      });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      if (!data.session) setSent(true);
      else toast.success("Account created — you are signed in");
    } else {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(false);
      if (error) toast.error(error.message);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-surface-strong p-12 text-surface-strong-foreground lg:flex">
        <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-md bg-success text-success-foreground"><TrendingUp className="size-5" /></div><span className="font-display text-xl font-extrabold">Save<span className="text-success">IQ</span></span></div>
        <div><h2 className="font-display text-4xl font-extrabold leading-tight">Your private savings<br />command center.</h2><p className="mt-4 max-w-md text-surface-strong-foreground/60">Plan goals, track progress, and get coaching tailored to you. Your goals are visible only to your account.</p></div>
        <div className="flex items-center gap-2 text-sm text-surface-strong-foreground/60"><ShieldCheck className="size-4 text-success" /> Private to every account</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise-in">
          {sent ? (
            <div className="text-center"><h1 className="font-display text-2xl font-extrabold">Check your email</h1><p className="mt-2 text-sm text-muted-foreground">We sent a confirmation link to {email}. Open it to activate your account.</p><Button variant="outline" className="mt-6" onClick={() => { setSent(false); setMode("signin"); }}>Back to sign in</Button></div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-extrabold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{mode === "signin" ? "Sign in to see your savings goals." : "Start with a clean dashboard and build your plan."}</p>
<form onSubmit={submit} className="mt-6 space-y-4">
                {mode === "signup" && <div className="space-y-2"><Label htmlFor="name">Display name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" /></div>}
                <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
                <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">{mode === "signin" ? "New to SaveIQ?" : "Already have an account?"} <button type="button" className="font-semibold text-foreground underline-offset-4 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
              <div className="mt-6 border-t border-border pt-6"><InstallAppButton variant="outline" className="w-full" /><p className="mt-2 text-center text-xs text-muted-foreground">Get SaveIQ on your phone or desktop — works offline.</p></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
