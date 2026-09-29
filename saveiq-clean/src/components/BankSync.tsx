import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Loader2, Lock, QrCode, Receipt, RefreshCw, ScanLine, ShieldCheck, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type BankLink = { method: "upi" | "account"; identifier: string; bank_name: string };
export type Txn = { id: string; goal_name: string; amount: number; source: string; description: string; reference: string; created_at: string };
type FundGoal = { id: string; name: string; target: number; current: number };

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
const BANKS = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const maskIdentifier = (link: BankLink) => link.method === "upi" ? link.identifier : `•••• ${link.identifier.slice(-4)}`;

export function LinkBankDialog({ open, onOpenChange, onLinked }: { open: boolean; onOpenChange: (o: boolean) => void; onLinked: (l: BankLink) => void }) {
  const [method, setMethod] = useState<"upi" | "account">("upi");
  const [identifier, setIdentifier] = useState("");
  const [bank, setBank] = useState(BANKS[3]!);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0); // 0 form, 1-3 verifying, 4 done
  useEffect(() => { if (open) { setStep(0); setIdentifier(""); setError(""); } }, [open]);

  const submit = async () => {
    const schema = method === "upi"
      ? z.string().trim().regex(/^[a-zA-Z0-9._-]{2,40}@[a-zA-Z]{2,20}$/, "Enter a valid UPI ID, e.g. name@okaxis")
      : z.string().trim().regex(/^\d{9,18}$/, "Account number must be 9–18 digits");
    const parsed = schema.safeParse(identifier);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid"); return; }
    setError("");
    for (const s of [1, 2, 3]) { setStep(s); await wait(700); }
    const link: BankLink = { method, identifier: parsed.data, bank_name: bank };
    const { error: dbError } = await supabase.from("bank_links").upsert(link);
    if (dbError) { toast.error("Bank linking failed"); setStep(0); return; }
    setStep(4);
    onLinked(link);
  };

  const steps = ["Encrypting credentials (AES-256)", "Handshake with Secure Banking Gateway", "Verifying account ownership"];
  return <Dialog open={open} onOpenChange={(o) => step === 0 || step === 4 ? onOpenChange(o) : undefined}><DialogContent>
    <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="text-success" /> Link bank account / UPI ID</DialogTitle><DialogDescription>Connect a (simulated) bank source. Only verified bank syncs can credit your goals.</DialogDescription></DialogHeader>
    {step === 0 && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">{(["upi", "account"] as const).map((m) => <button key={m} type="button" onClick={() => { setMethod(m); setIdentifier(""); setError(""); }} className={cn("rounded px-3 py-2 text-sm font-semibold transition", method === m ? "bg-card shadow-sm" : "text-muted-foreground")}>{m === "upi" ? "UPI ID" : "Account number"}</button>)}</div>
      <div className="space-y-2"><Label>Bank</Label><Select value={bank} onValueChange={setBank}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="bank-id">{method === "upi" ? "UPI ID" : "Account number"}</Label><Input id="bank-id" value={identifier} maxLength={40} inputMode={method === "account" ? "numeric" : "email"} placeholder={method === "upi" ? "user@okaxis" : "123456789012"} onChange={(e) => setIdentifier(e.target.value)} autoFocus />{error && <p className="text-xs text-destructive">{error}</p>}</div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" /> Demo simulator — no real bank is contacted and no money moves.</p>
    </div>}
    {step >= 1 && step <= 3 && <ul className="space-y-3 py-2">{steps.map((s, i) => <li key={s} className="flex items-center gap-3 text-sm">{step > i + 1 ? <CheckCircle2 className="size-4 text-success" /> : step === i + 1 ? <Loader2 className="size-4 animate-spin text-primary" /> : <span className="size-4 rounded-full border" />}<span className={step >= i + 1 ? "" : "text-muted-foreground"}>{s}</span></li>)}</ul>}
    {step === 4 && <div className="rounded-lg border border-success/40 bg-success/10 p-5 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><p className="mt-2 font-display font-bold">Connected to Secure Banking Gateway</p><p className="mt-1 text-sm text-muted-foreground">{bank} · {method === "upi" ? identifier : `•••• ${identifier.slice(-4)}`}</p></div>}
    <DialogFooter>{step === 0 && <><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}><ShieldCheck /> Verify & link</Button></>}{step === 4 && <Button onClick={() => onOpenChange(false)}>Done</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}

type Source = "qr" | "roundup" | "salary";
type Detected = { amount: number; lines: { label: string; value: string }[]; source: string; description: string };

const MERCHANTS: [string, number][] = [["Swiggy", 12.4], ["Uber", 8.65], ["Starbucks", 4.3], ["Amazon", 23.15], ["Zomato", 9.8], ["Metro card", 2.25], ["BigBasket", 31.7], ["Netflix", 6.49]];

function detect(source: Source): Detected {
  if (source === "roundup") {
    const picks = [...MERCHANTS].sort(() => Math.random() - 0.5).slice(0, 5).map(([m, v]) => { const amt = +(v * (0.8 + Math.random() * 0.6)).toFixed(2); return { m, amt, up: +(Math.ceil(amt) - amt || 1).toFixed(2) }; });
    const total = +picks.reduce((s, p) => s + p.up, 0).toFixed(2);
    return { amount: total, source: "UPI round-ups", description: `Round-ups from ${picks.length} UPI payments`, lines: picks.map((p) => ({ label: `${p.m} · ${usd(p.amt)}`, value: `+${usd(p.up)}` })) };
  }
  if (source === "salary") {
    const salary = 4200 + Math.round(Math.random() * 8) * 100;
    const sweep = Math.round(salary * 0.1);
    return { amount: sweep, source: "Salary auto-sweep", description: `10% sweep of salary credit ${usd(salary)}`, lines: [{ label: "Salary credit · ACME Corp", value: usd(salary) }, { label: "Auto-sweep rule", value: "10%" }] };
  }
  const amt = [50, 75, 100, 150, 200, 250][Math.floor(Math.random() * 6)]!;
  return { amount: amt, source: "UPI QR deposit", description: "Verified UPI QR collect request", lines: [{ label: "Payer VPA verified", value: "✓" }, { label: "Collect amount (bank-signed)", value: usd(amt) }] };
}

function MockQr({ seed }: { seed: string }) {
  const cells = useMemo(() => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return Array.from({ length: 441 }, (_, i) => { h = (h * 1103515245 + 12345 + i) >>> 0; return (h >> 16) % 2 === 0; }); }, [seed]);
  const finder = (x: number, y: number) => { const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7; for (const [ox, oy] of [[0, 0], [14, 0], [0, 14]] as const) if (inBox(ox, oy)) { const dx = x - ox, dy = y - oy; return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4); } return null; };
  return <svg viewBox="0 0 21 21" className="size-40 rounded-md bg-card p-2" shapeRendering="crispEdges">{cells.map((on, i) => { const x = i % 21, y = Math.floor(i / 21); const f = finder(x, y); return (f ?? on) ? <rect key={i} x={x} y={y} width={1} height={1} fill="currentColor" /> : null; })}</svg>;
}

export function DepositDialog({ goal, link, onClose, onCredited }: { goal: FundGoal | null; link: BankLink | null; onClose: () => void; onCredited: (txn: Txn) => void }) {
  const [source, setSource] = useState<Source>("qr");
  const [phase, setPhase] = useState<"idle" | "scanning" | "detected" | "routing">("idle");
  const [detected, setDetected] = useState<Detected | null>(null);
  useEffect(() => { if (goal) { setPhase("idle"); setDetected(null); setSource("qr"); } }, [goal]);
  if (!goal || !link) return null;
  const remaining = goal.target - goal.current;

  const scan = async () => { setPhase("scanning"); setDetected(null); await wait(1600); setDetected(detect(source)); setPhase("detected"); };
  const route = async () => {
    if (!detected) return;
    setPhase("routing");
    const { data, error } = await supabase.rpc("credit_goal", { _goal_id: goal.id, _amount: detected.amount, _source: detected.source, _description: detected.description });
    if (error || !data) { toast.error("Transaction could not be verified", { description: error?.message }); setPhase("detected"); return; }
    const txn = data as unknown as Txn;
    onCredited({ ...txn, amount: Number(txn.amount) });
    toast.success(`${usd(Number(txn.amount))} routed to ${goal.name}`, { description: `Ref ${txn.reference} · ${detected.source}` });
    onClose();
  };

  const tabs: { id: Source; label: string; icon: typeof QrCode }[] = [{ id: "qr", label: "Scan UPI QR", icon: QrCode }, { id: "roundup", label: "UPI round-ups", icon: RefreshCw }, { id: "salary", label: "Salary sweep", icon: Wallet }];
  return <Dialog open onOpenChange={(o) => { if (!o && phase !== "routing") onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Scan & Pay / Auto-Detect Deposit</DialogTitle><DialogDescription>Funds for <strong>{goal.name}</strong> come only from verified bank activity. {usd(remaining)} left to reach the target.</DialogDescription></DialogHeader>
    <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs"><ShieldCheck className="size-4 text-success" /> Connected to Secure Banking Gateway · {link.bank_name} · {maskIdentifier(link)}</div>
    <div className="grid grid-cols-3 gap-2">{tabs.map((t) => <button key={t.id} type="button" disabled={phase === "scanning" || phase === "routing"} onClick={() => { setSource(t.id); setPhase("idle"); setDetected(null); }} className={cn("flex flex-col items-center gap-1 rounded-md border p-3 text-xs font-semibold transition", source === t.id ? "border-primary bg-secondary" : "text-muted-foreground hover:bg-muted")}><t.icon className="size-4" />{t.label}</button>)}</div>
    <div className="grid place-items-center rounded-lg bg-muted/60 p-5">
      {source === "qr" && phase !== "detected" && <div className="relative text-foreground"><MockQr seed={goal.id + link.identifier} />{phase === "scanning" && <div className="pointer-events-none absolute inset-x-2 top-2 h-0.5 animate-[scanline_1.6s_ease-in-out_infinite] bg-success shadow-[0_0_12px_var(--success)]" />}</div>}
      {source !== "qr" && phase !== "detected" && <div className="py-6 text-center">{phase === "scanning" ? <Loader2 className="mx-auto size-8 animate-spin text-primary" /> : source === "roundup" ? <RefreshCw className="mx-auto size-8 text-primary" /> : <Building2 className="mx-auto size-8 text-primary" />}<p className="mt-2 text-sm text-muted-foreground">{phase === "scanning" ? "AI is scanning your recent bank feed…" : source === "roundup" ? "Round up today's UPI payments to the next dollar." : "Detect your latest salary credit and sweep 10%."}</p></div>}
      {phase === "detected" && detected && <div className="w-full space-y-3"><div className="flex items-center gap-2 text-sm font-semibold text-success"><Zap className="size-4" /> AI detected a verified deposit</div><ul className="divide-y rounded-md border bg-card text-sm">{detected.lines.map((l) => <li key={l.label} className="flex justify-between px-3 py-2"><span className="text-muted-foreground">{l.label}</span><span className="font-semibold">{l.value}</span></li>)}</ul><div className="flex items-end justify-between"><span className="text-sm text-muted-foreground">Verified amount</span><span className="font-display text-2xl font-extrabold">{usd(Math.min(detected.amount, remaining))}</span></div>{detected.amount > remaining && <p className="text-xs text-muted-foreground">Capped at the amount remaining for this goal.</p>}</div>}
    </div>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" /> Manual amount entry is disabled — only bank-verified amounts can be credited.</p>
    <DialogFooter><Button variant="outline" onClick={onClose} disabled={phase === "routing"}>Cancel</Button>{phase === "detected" ? <Button onClick={route}><CheckCircle2 /> Route to goal</Button> : <Button onClick={scan} disabled={phase === "scanning"}>{phase === "scanning" ? <Loader2 className="animate-spin" /> : <ScanLine />}{source === "qr" ? "Scan QR" : "Simulate incoming transaction"}</Button>}{phase === "routing" && <Button disabled><Loader2 className="animate-spin" /> Verifying…</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}

export function TransactionHistory({ txns }: { txns: Txn[] }) {
  return <section className="animate-rise-in rounded-lg border bg-card">
    <div className="flex items-center justify-between border-b p-5 sm:px-6"><div><h2 className="font-display text-lg font-bold">Transaction history</h2><p className="text-sm text-muted-foreground">Verified credits routed into your goals</p></div><Receipt className="text-muted-foreground" /></div>
    {txns.length ? <ul className="divide-y">{txns.slice(0, 12).map((t) => <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-semibold">{t.source} → {t.goal_name}</p><p className="truncate text-xs text-muted-foreground">{t.description} · {t.reference} · {new Date(t.created_at).toLocaleString()}</p></div><span className="shrink-0 font-display font-bold text-success">+{usd(t.amount)}</span></li>)}</ul> : <p className="p-8 text-center text-sm text-muted-foreground">No transactions yet. Link a bank and auto-detect a deposit to fund a goal.</p>}
  </section>;
}
