import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthScreen } from "@/components/AuthScreen";
import { InstallAppButton } from "@/components/InstallApp";
import { DepositDialog, LinkBankDialog, TransactionHistory, maskIdentifier, type BankLink, type Txn } from "@/components/BankSync";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  Flag,
  Goal as GoalIcon,
  Home,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Category = "Emergency" | "Investment" | "Asset" | "Luxury";
type Goal = { id: string; name: string; target: number; current: number; category: Category; deadline: string };
type ChatMessage = { role: "user" | "assistant"; text: string };



const categoryColor: Record<Category, string> = {
  Emergency: "var(--chart-emergency)", Investment: "var(--chart-investment)", Asset: "var(--chart-asset)", Luxury: "var(--chart-luxury)",
};

const goalSchema = z.object({
  name: z.string().trim().min(2, "Enter a goal name").max(60, "Keep the name under 60 characters"),
  target: z.number().positive("Target must be greater than zero").max(100000000, "Target is too large"),
  current: z.number().min(0, "Current savings cannot be negative").max(100000000, "Amount is too large"),
  category: z.enum(["Emergency", "Investment", "Asset", "Luxury"]),
  deadline: z.string().refine((value) => new Date(`${value}T23:59:59`).getTime() > Date.now(), "Choose a future deadline"),
});

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "SaveIQ — AI Savings Goal Tracker" },
    { name: "description", content: "Plan savings goals, track progress, and get intelligent financial coaching with SaveIQ." },
    { property: "og:title", content: "SaveIQ — AI Savings Goal Tracker" },
    { property: "og:description", content: "A modern savings dashboard with live goal planning and intelligent coaching." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SaveIQApp,
});

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const compactMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
const daysLeft = (deadline: string) => Math.max(0, Math.ceil((new Date(`${deadline}T23:59:59`).getTime() - Date.now()) / 86400000));
const goalMath = (goal: Goal) => {
  const remaining = Math.max(0, goal.target - goal.current);
  const days = daysLeft(goal.deadline);
  return { remaining, days, weekly: days ? remaining / Math.max(days / 7, 1) : remaining, monthly: days ? remaining / Math.max(days / 30.44, 1) : remaining };
};
const formatDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));

type Viewer = { id: string; email: string; name: string };

function SaveIQApp() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const toViewer = async (user: User | null) => {
      if (!user) { setViewer(null); setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const meta = user.user_metadata as Record<string, unknown>;
      const name = data?.display_name || (typeof meta["full_name"] === "string" ? meta["full_name"] : "") || (user.email ?? "Saver").split("@")[0] || "Saver";
      setViewer({ id: user.id, email: user.email ?? "", name });
      setLoading(false);
    };
    // Every fresh app launch starts at the sign-in screen: drop any remembered session
    // unless the user already signed in during this open window/tab.
    const LAUNCH_KEY = "saveiq-session-active";
    const freshLaunch = window.sessionStorage.getItem(LAUNCH_KEY) !== "1";
    let ready = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!ready) return;
      if (event === "SIGNED_IN") window.sessionStorage.setItem(LAUNCH_KEY, "1");
      if (event === "SIGNED_OUT") window.sessionStorage.removeItem(LAUNCH_KEY);
      setTimeout(() => { void toViewer(session?.user ?? null); }, 0);
    });
    (async () => {
      if (freshLaunch) await supabase.auth.signOut({ scope: "local" });
      ready = true;
      const { data } = await supabase.auth.getUser();
      await toViewer(freshLaunch ? null : data.user);
    })();
    window.localStorage.removeItem("saveiq-goals");
    window.localStorage.removeItem("saveiq-goals-v2");
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading SaveIQ…</div>;
  if (!viewer) return <AuthScreen />;
  return <Dashboard key={viewer.id} viewer={viewer} />;
}

type GoalRow = { id: string; name: string; target: number | string; current: number | string; category: string; deadline: string };
const fromRow = (row: GoalRow): Goal => ({ id: row.id, name: row.name, target: Number(row.target), current: Number(row.current), category: row.category as Category, deadline: row.deadline });

function Dashboard({ viewer }: { viewer: Viewer }) {
  const firstName = viewer.name.split(" ")[0] ?? viewer.name;
  const initials = viewer.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [funding, setFunding] = useState<Goal | null>(null);
  const [bankLink, setBankLink] = useState<BankLink | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pendingFund, setPendingFund] = useState<Goal | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [filter, setFilter] = useState<"active" | "completed">("active");
  const [mobileNav, setMobileNav] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: `Hi ${firstName} — I’m your SaveIQ Coach. Ask me how to reach a goal faster or improve your saving plan.` }]);
  const [question, setQuestion] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const chatInitialized = useRef(false);

  useEffect(() => {
    supabase.from("goals").select("id,name,target,current,category,deadline").order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) { toast.error("Could not load your goals"); return; }
      setGoals((data ?? []).map(fromRow));
    });
    supabase.from("bank_links").select("method,identifier,bank_name").maybeSingle().then(({ data }) => { if (data) setBankLink(data as BankLink); });
    supabase.from("transactions").select("id,goal_name,amount,source,description,reference,created_at").order("created_at", { ascending: false }).limit(50).then(({ data }) => { setTxns((data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }))); });
  }, [viewer.id]);

  useEffect(() => {
    if (!chatInitialized.current) { chatInitialized.current = true; return; }
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const totals = useMemo(() => {
    const saved = goals.reduce((sum, goal) => sum + goal.current, 0);
    const target = goals.reduce((sum, goal) => sum + goal.target, 0);
    const active = goals.filter((goal) => goal.current < goal.target).length;
    const progress = target ? Math.round((saved / target) * 100) : 0;
    const onTrack = goals.filter((goal) => goal.current >= goal.target || (goalMath(goal).monthly <= Math.max(goal.current * 0.08, 300))).length;
    const health = goals.length ? Math.min(98, Math.round(68 + (onTrack / goals.length) * 24 + Math.min(progress / 10, 6))) : 72;
    return { saved, target, active, progress, health };
  }, [goals]);

  const portfolio = useMemo(() => (Object.keys(categoryColor) as Category[]).map((category) => ({
    name: category, value: goals.filter((goal) => goal.category === category).reduce((sum, goal) => sum + goal.current, 0), fill: categoryColor[category],
  })).filter((item) => item.value > 0), [goals]);

  const activeGoals = goals.filter((goal) => filter === "active" ? goal.current < goal.target : goal.current >= goal.target);
  const priority = goals.filter((goal) => goal.current < goal.target).sort((a, b) => goalMath(b).monthly - goalMath(a).monthly)[0];

  const saveGoal = async (goal: Omit<Goal, "id">) => {
    if (editing) {
      const { data, error } = await supabase.from("goals").update(goal).eq("id", editing.id).select("id,name,target,current,category,deadline").single();
      if (error || !data) { toast.error("Could not update goal"); return; }
      setGoals((items) => items.map((item) => item.id === editing.id ? fromRow(data) : item));
      toast.success("Goal updated", { description: `${goal.name} now reflects your latest plan.` });
    } else {
      const { data, error } = await supabase.from("goals").insert({ ...goal, user_id: viewer.id }).select("id,name,target,current,category,deadline").single();
      if (error || !data) { toast.error("Could not create goal"); return; }
      setGoals((items) => [fromRow(data), ...items]);
      toast.success("New goal created", { description: `${goal.name} is ready to track.` });
    }
    setEditing(null);
    setGoalDialogOpen(false);
  };

  const startFunding = (goal: Goal) => {
    if (!bankLink) { toast.info("Link a bank account first", { description: "Funds can only come from a verified bank source." }); setPendingFund(goal); setLinkOpen(true); return; }
    setFunding(goal);
  };

  const onCredited = (txn: Txn) => {
    setTxns((items) => [txn, ...items]);
    setGoals((items) => items.map((goal) => goal.id === funding?.id ? { ...goal, current: Math.min(goal.target, goal.current + txn.amount) } : goal));
  };

  const deleteGoal = async (goal: Goal) => {
    if (!window.confirm(`Delete “${goal.name}”? This cannot be undone.`)) return;
    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (error) { toast.error("Could not delete goal"); return; }
    setGoals((items) => items.filter((item) => item.id !== goal.id));
    toast.success("Goal deleted");
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const askCoach = (event: FormEvent) => {
    event.preventDefault();
    const clean = question.trim().slice(0, 300);
    if (!clean) return;
    const lower = clean.toLowerCase();
    let reply = `A strong next step is to automate ${money(Math.max(25, Math.round((priority ? goalMath(priority).weekly : 100) / 5) * 5))} each week. That keeps saving consistent without relying on willpower.`;
    if (lower.includes("emergency")) reply = "Aim for 3–6 months of essential expenses. Keep this money accessible, automate weekly deposits, and avoid investing it in volatile assets.";
    else if (lower.includes("faster") || lower.includes("behind")) reply = priority ? `Focus on ${priority.name} first. It needs about ${money(goalMath(priority).weekly)} weekly. A temporary 10% spending cut plus an automatic payday transfer would close the gap fastest.` : "You’re fully funded across your current goals. Consider raising your next target or starting a long-term investment goal.";
    else if (lower.includes("budget") || lower.includes("spend")) reply = "Try a 50/30/20 baseline, then move any unused wants budget to your highest-priority goal at week’s end. Review recurring subscriptions first.";
    else if (lower.includes("invest")) reply = "Protect your emergency reserve first, then use a diversified, low-cost approach aligned with your time horizon and risk tolerance. Avoid investing money needed soon.";
    setMessages((items) => [...items, { role: "user", text: clean }, { role: "assistant", text: reply }]);
    setQuestion("");
  };

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[248px_1fr]">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-surface-strong text-surface-strong-foreground transition-transform duration-300 lg:translate-x-0", mobileNav ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center justify-between border-b border-surface-strong-foreground/10 px-6">
          <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-md bg-success text-success-foreground"><TrendingUp className="size-5" /></div><span className="font-display text-xl font-extrabold">Save<span className="text-success">IQ</span></span></div>
          <Button variant="ghost" size="icon" className="text-surface-strong-foreground lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu"><X /></Button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Main navigation">
          <NavItem icon={Home} label="Overview" active />
          <NavItem icon={GoalIcon} label="My Goals" />
          <NavItem icon={BarChart3} label="Insights" />
          <NavItem icon={MessageSquareText} label="AI Coach" badge="4" />
          <p className="px-3 pb-2 pt-7 text-[11px] font-bold uppercase tracking-wider text-surface-strong-foreground/45">Account</p>
          <NavItem icon={WalletCards} label="Transactions" />
          <NavItem icon={Settings} label="Settings" />
        </nav>
        <div className="m-3 rounded-md border border-surface-strong-foreground/10 bg-surface-strong-foreground/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-success" /> {bankLink ? "Bank connected" : "No bank linked"}</div>
          <p className="text-xs leading-5 text-surface-strong-foreground/55">{bankLink ? `Connected to Secure Banking Gateway · ${bankLink.bank_name} ${maskIdentifier(bankLink)}` : "Link a bank account or UPI ID to fund goals."}</p>
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setLinkOpen(true)}>{bankLink ? "Change bank" : "Link bank / UPI"}</Button>
          <InstallAppButton size="sm" className="mt-2 w-full" />
        </div>
        <div className="flex items-center gap-3 border-t border-surface-strong-foreground/10 p-4"><div className="grid size-9 place-items-center rounded-full bg-accent font-bold text-accent-foreground">{initials}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{viewer.name}</p><p className="truncate text-xs text-surface-strong-foreground/50">{viewer.email}</p></div><Button variant="ghost" size="icon" className="text-surface-strong-foreground" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut className="size-4" /></Button></div>
      </aside>
      {mobileNav && <div className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileNav(false)} aria-hidden="true" />}

      <main className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex items-center gap-3"><Button variant="outline" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu /></Button><div><p className="font-display text-lg font-bold sm:text-xl">Financial Overview</p><p className="hidden text-xs text-muted-foreground sm:block">Tuesday, September 29</p></div></div>
          <div className="flex items-center gap-2"><div className="relative hidden md:block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="w-56 bg-card pl-9" placeholder="Search goals" aria-label="Search goals" /></div><Button variant="outline" size="icon" aria-label="Notifications" title="Notifications"><Bell /></Button><Button onClick={() => { setEditing(null); setGoalDialogOpen(true); }}><Plus /> <span className="hidden sm:inline">Add new goal</span></Button></div>
        </header>

        <div className="mx-auto max-w-[1600px] space-y-7 p-4 sm:p-7 lg:p-10">
          <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><p className="mb-1 text-sm font-semibold text-success">YOUR FINANCIAL COMMAND CENTER</p><h1 className="font-display text-2xl font-extrabold sm:text-3xl">Good to see you, {firstName}.</h1><p className="mt-1 text-sm text-muted-foreground">{goals.length ? "Your savings are building momentum. Here’s today’s picture." : "Set your first savings goal and watch your plan come to life."}</p></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-success" /> Updated just now</div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={CircleDollarSign} label="Total saved amount" value={money(totals.saved)} detail={goals.length ? `${compactMoney(totals.target)} total target` : "No savings tracked yet"} trend={goals.length ? "12.4%" : undefined} />
            <MetricCard icon={Target} label="Active goals" value={String(totals.active)} detail={goals.length ? `${goals.length - totals.active} completed` : "Add a goal to get started"} />
            <MetricCard icon={TrendingUp} label="Overall progress" value={`${totals.progress}%`} detail={goals.length ? "Across all savings goals" : "Progress starts with your first goal"} progress={totals.progress} />
            <MetricCard icon={Sparkles} label="AI health score" value={goals.length ? String(totals.health) : "—"} detail={goals.length ? "Excellent financial health" : "Unlocks once you add goals"} score={goals.length > 0} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.85fr)]">
            <div className="rounded-lg border bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start justify-between"><div><h2 className="font-display text-lg font-bold">Savings portfolio</h2><p className="text-sm text-muted-foreground">How your savings are distributed</p></div><span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">All goals</span></div>
              <div className="grid items-center gap-4 md:grid-cols-[minmax(250px,1fr)_1fr]">
                <div className="relative h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={portfolio} dataKey="value" innerRadius={67} outerRadius={92} paddingAngle={3} stroke="var(--card)" strokeWidth={4} animationDuration={700} /><ChartTooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: "8px", borderColor: "var(--border)", background: "var(--card)" }} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 grid place-content-center text-center"><strong className="font-display text-2xl">{compactMoney(totals.saved)}</strong><span className="text-xs text-muted-foreground">{goals.length ? "total saved" : "no goals yet"}</span></div></div>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">{portfolio.length ? portfolio.map((item) => <div key={item.name} className="flex items-center gap-3"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.fill }} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{item.name}</span><strong>{money(item.value)}</strong></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${totals.saved ? (item.value / totals.saved) * 100 : 0}%`, backgroundColor: item.fill }} /></div></div><span className="w-10 text-right text-xs text-muted-foreground">{totals.saved ? Math.round((item.value / totals.saved) * 100) : 0}%</span></div>) : <p className="text-sm leading-6 text-muted-foreground">Add goals to see how your savings are distributed across categories.</p>}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-surface-strong text-surface-strong-foreground shadow-lg">
              <div className="flex items-center justify-between border-b border-surface-strong-foreground/10 p-5"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-md bg-success text-success-foreground"><Sparkles className="size-4" /></div><div><h2 className="font-display font-bold">AI Savings Coach</h2><p className="text-xs text-surface-strong-foreground/55">Personalized for your goals</p></div></div><span className="flex items-center gap-1.5 text-xs text-success"><span className="size-1.5 rounded-full bg-success" /> Live</span></div>
              <div className="space-y-4 p-5">
                {goals.length ? <Insight icon={TrendingUp} title="Strong momentum" text={`You’ve reached ${totals.progress}% of your combined targets. Keep your automatic transfers active.`} tone="success" />
                : <Insight icon={Bot} title="Let’s get started" text="Create your first savings goal and I’ll build a personalized plan to reach it." tone="info" />}
                {priority && <Insight icon={AlertTriangle} title="Priority watch" text={`${priority.name} needs ${money(goalMath(priority).weekly)} per week to stay on schedule.`} tone="warning" />}
                <Insight icon={Sparkles} title="Smart move" text="Redirect one unused subscription this month to create an effortless savings boost." tone="info" />
                <Button variant="secondary" className="w-full" onClick={() => document.getElementById("coach-chat")?.scrollIntoView({ behavior: "smooth" })}>Chat with your coach <ChevronRight /></Button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-6"><div><h2 className="font-display text-lg font-bold">Savings goals</h2><p className="text-sm text-muted-foreground">Track every milestone and stay on schedule</p></div><div className="flex items-center gap-2"><div className="flex rounded-md bg-muted p-1"><Button size="sm" variant={filter === "active" ? "default" : "ghost"} onClick={() => setFilter("active")}>Active ({goals.filter((g) => g.current < g.target).length})</Button><Button size="sm" variant={filter === "completed" ? "default" : "ghost"} onClick={() => setFilter("completed")}>Completed ({goals.filter((g) => g.current >= g.target).length})</Button></div></div></div>
            {activeGoals.length ? <div className="grid gap-4 p-5 lg:grid-cols-2 sm:p-6">{activeGoals.map((goal, index) => <GoalCard key={goal.id} goal={goal} index={index} onEdit={() => { setEditing(goal); setGoalDialogOpen(true); }} onFund={() => startFunding(goal)} onDelete={() => deleteGoal(goal)} />)}</div> : <div className="grid min-h-52 place-items-center p-8 text-center"><div><div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-muted"><Target className="text-muted-foreground" /></div><h3 className="font-display font-bold">{filter === "active" ? "No active goals" : "No completed goals yet"}</h3><p className="mt-1 text-sm text-muted-foreground">{filter === "active" ? "Create your first goal to start your savings plan." : "Your completed milestones will appear here."}</p>{filter === "active" && <Button className="mt-4" onClick={() => { setEditing(null); setGoalDialogOpen(true); }}><Plus /> Add your first goal</Button>}</div></div>}
          </section>

          <TransactionHistory txns={txns} />

          <section id="coach-chat" className="grid overflow-hidden rounded-lg border bg-card shadow-sm lg:grid-cols-[.8fr_1.2fr]">
            <div className="bg-secondary p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-md bg-primary text-primary-foreground"><Bot /></div><h2 className="mt-5 font-display text-2xl font-extrabold">Ask SaveIQ Coach</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Get practical guidance based on your current goals. Try asking about emergency funds, budgets, or catching up.</p><div className="mt-6 space-y-2">{["How can I save faster?", "Help me build a budget", "How much emergency fund do I need?"].map((prompt) => <Button key={prompt} variant="outline" className="w-full justify-between bg-card" onClick={() => setQuestion(prompt)}>{prompt}<ChevronRight /></Button>)}</div></div>
            <div className="flex min-h-[440px] flex-col"><div className="flex items-center gap-3 border-b p-4"><div className="relative grid size-9 place-items-center rounded-full bg-accent text-accent-foreground"><Bot className="size-4" /><span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card bg-success" /></div><div><p className="text-sm font-semibold">SaveIQ Coach</p><p className="text-xs text-muted-foreground">Always here to help</p></div></div><div className="max-h-[360px] flex-1 space-y-4 overflow-y-auto p-5">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={cn("flex", message.role === "user" && "justify-end")}><div className={cn("max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6", message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{message.text}</div></div>)}<div ref={chatEnd} /></div><form onSubmit={askCoach} className="flex gap-2 border-t p-4"><Input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={300} placeholder="Ask about your savings..." aria-label="Message SaveIQ Coach" /><Button type="submit" size="icon" aria-label="Send message"><Send /></Button></form></div>
          </section>
          <p className="pb-2 text-center text-xs text-muted-foreground">SaveIQ insights are educational and do not constitute financial advice.</p>
        </div>
      </main>

      <GoalDialog open={goalDialogOpen} initial={editing} onOpenChange={(open) => { setGoalDialogOpen(open); if (!open) setEditing(null); }} onSave={saveGoal} />
      <LinkBankDialog open={linkOpen} onOpenChange={(open) => { setLinkOpen(open); if (!open && pendingFund && bankLink) { setFunding(pendingFund); } if (!open) setPendingFund(null); }} onLinked={(link) => { setBankLink(link); toast.success("Connected to Secure Banking Gateway", { description: `${link.bank_name} · ${maskIdentifier(link)}` }); }} />
      <DepositDialog goal={funding} link={bankLink} onClose={() => setFunding(null)} onCredited={onCredited} />
    </div>
  );
}

function NavItem({ icon: Icon, label, active, badge }: { icon: typeof Home; label: string; active?: boolean; badge?: string }) {
  return <Button variant="ghost" className={cn("h-11 w-full justify-start gap-3 px-3 text-surface-strong-foreground/65 hover:bg-surface-strong-foreground/10 hover:text-surface-strong-foreground", active && "bg-surface-strong-foreground/10 text-surface-strong-foreground")}><Icon className={cn("size-[18px]", active && "text-success")} /><span className="flex-1 text-left">{label}</span>{badge && <span className="grid size-5 place-items-center rounded-full bg-success text-[10px] font-bold text-success-foreground">{badge}</span>}</Button>;
}

function MetricCard({ icon: Icon, label, value, detail, trend, progress, score }: { icon: typeof Home; label: string; value: string; detail: string; trend?: string | undefined; progress?: number; score?: boolean }) {
  return <article className="animate-rise-in rounded-lg border bg-card p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md"><div className="mb-5 flex items-start justify-between"><div className="grid size-10 place-items-center rounded-md bg-secondary text-primary"><Icon className="size-5" /></div>{trend && <span className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-bold text-accent-foreground"><ArrowUpRight className="size-3" />{trend}</span>}{score && <span className="rounded-md bg-accent px-2 py-1 text-xs font-bold text-accent-foreground">Excellent</span>}</div><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-extrabold">{value}{score && <span className="ml-1 text-sm font-medium text-muted-foreground">/ 100</span>}</p>{progress !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success transition-all duration-700" style={{ width: `${Math.min(progress, 100)}%` }} /></div>}<p className="mt-2 text-xs text-muted-foreground">{detail}</p></article>;
}

function Insight({ icon: Icon, title, text, tone }: { icon: typeof Home; title: string; text: string; tone: "success" | "warning" | "info" }) {
  return <div className="flex gap-3"><div className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-md", tone === "success" && "bg-success/15 text-success", tone === "warning" && "bg-warning/15 text-warning", tone === "info" && "bg-info/15 text-info")}><Icon className="size-4" /></div><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-surface-strong-foreground/55">{text}</p></div></div>;
}

function GoalCard({ goal, index, onEdit, onFund, onDelete }: { goal: Goal; index: number; onEdit: () => void; onFund: () => void; onDelete: () => void }) {
  const calc = goalMath(goal);
  const progress = Math.min(100, Math.round((goal.current / goal.target) * 100));
  const complete = progress >= 100;
  return <article className="animate-rise-in rounded-lg border p-5 transition duration-300 hover:border-ring/60 hover:shadow-md" style={{ animationDelay: `${index * 60}ms` }}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary"><Flag className="size-4" /></div><div className="min-w-0"><h3 className="truncate font-display font-bold">{goal.name}</h3><div className="mt-1 flex flex-wrap items-center gap-2"><span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">{goal.category}</span><span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", complete ? "bg-success/15 text-success" : calc.days < 90 ? "bg-warning/15 text-warning-foreground" : "bg-info/15 text-info-foreground")}>{complete ? "Completed" : calc.days < 90 ? "Needs attention" : "On track"}</span></div></div></div><div className="flex shrink-0"><Button variant="ghost" size="icon" onClick={onEdit} title="Edit goal" aria-label={`Edit ${goal.name}`}><Edit3 /></Button><Button variant="ghost" size="icon" onClick={onDelete} title="Delete goal" aria-label={`Delete ${goal.name}`} className="text-destructive"><Trash2 /></Button></div></div><div className="mt-5 flex items-end justify-between"><div><p className="font-display text-xl font-extrabold">{money(goal.current)} <span className="text-sm font-medium text-muted-foreground">of {money(goal.target)}</span></p></div><strong className="text-sm text-primary">{progress}%</strong></div><div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success transition-all duration-700" style={{ width: `${progress}%` }} /></div><div className="mt-5 grid grid-cols-3 divide-x rounded-md bg-muted/60 py-3 text-center"><div><p className="text-[10px] font-bold uppercase text-muted-foreground">Remaining</p><p className="mt-1 text-sm font-bold">{money(calc.remaining)}</p></div><div><p className="text-[10px] font-bold uppercase text-muted-foreground">Weekly</p><p className="mt-1 text-sm font-bold">{complete ? "—" : money(calc.weekly)}</p></div><div><p className="text-[10px] font-bold uppercase text-muted-foreground">Monthly</p><p className="mt-1 text-sm font-bold">{complete ? "—" : money(calc.monthly)}</p></div></div><div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{complete ? "Goal reached" : `${calc.days} days left · ${formatDate(goal.deadline)}`}</div>{!complete && <Button size="sm" onClick={onFund}><ScanLine /> Scan & Pay / Auto-Detect</Button>}</div></article>;
}

function GoalDialog({ open, initial, onOpenChange, onSave }: { open: boolean; initial: Goal | null; onOpenChange: (open: boolean) => void; onSave: (goal: Omit<Goal, "id">) => void | Promise<void> }) {
  const [name, setName] = useState(""); const [target, setTarget] = useState(""); const [current, setCurrent] = useState(""); const [category, setCategory] = useState<Category>("Emergency"); const [deadline, setDeadline] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (!open) return; setName(initial?.name ?? ""); setTarget(initial ? String(initial.target) : ""); setCurrent(initial ? String(initial.current) : "0"); setCategory(initial?.category ?? "Emergency"); setDeadline(initial?.deadline ?? ""); setErrors({}); }, [open, initial]);
  const submit = (event: FormEvent) => { event.preventDefault(); const parsed = goalSchema.safeParse({ name, target: Number(target), current: Number(current), category, deadline }); if (!parsed.success) { const next: Record<string, string> = {}; parsed.error.issues.forEach((issue) => { const key = String(issue.path[0]); if (!next[key]) next[key] = issue.message; }); setErrors(next); return; } if (parsed.data.current > parsed.data.target) { setErrors({ current: "Current savings cannot exceed the target" }); return; } onSave(parsed.data); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{initial ? "Edit savings goal" : "Add new savings goal"}</DialogTitle><DialogDescription>Set your target and SaveIQ will calculate the pace you need.</DialogDescription></DialogHeader><form id="goal-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="goal-name">Goal name</Label><Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Emergency fund" autoFocus />{errors["name"] && <p className="text-xs text-destructive">{errors["name"]}</p>}</div><div className="space-y-2"><Label htmlFor="goal-target">Target amount</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input id="goal-target" type="number" min="1" max="100000000" className="pl-7" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10,000" /></div>{errors["target"] && <p className="text-xs text-destructive">{errors["target"]}</p>}</div><div className="space-y-2"><Label htmlFor="goal-current">Current savings</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input id="goal-current" readOnly disabled className="pl-7" value={current || "0"} aria-describedby="goal-current-note" /></div><p id="goal-current-note" className="text-xs text-muted-foreground">Locked — funds arrive only via verified bank sync.</p>{errors["current"] && <p className="text-xs text-destructive">{errors["current"]}</p>}</div><div className="space-y-2"><Label>Category</Label><Select value={category} onValueChange={(value) => setCategory(value as Category)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["Emergency", "Investment", "Asset", "Luxury"] as Category[]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="goal-deadline">Target deadline</Label><Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />{errors["deadline"] && <p className="text-xs text-destructive">{errors["deadline"]}</p>}</div></form><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="goal-form">{initial ? "Save changes" : "Create goal"}</Button></DialogFooter></DialogContent></Dialog>;
}