import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  Bell,
  Building2,
  Command as CommandIcon,
  FileText,
  LogOut,
  Menu,
  QrCode,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { LanguageSwitcher } from "@/components/features/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type NavLinkItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  showWhenAuthed?: boolean;
};

function ActivePill({
  active,
  children,
  className,
}: {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {active ? (
        <motion.div
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/20"
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

function TopNavItem({ item }: { item: NavLinkItem }) {
  // ✅ FIX: useLocation() returns an object; destructure pathname. [file:484]
  const { pathname } = useLocation();
  const active = pathname === item.to || pathname.startsWith(item.to + "/") || pathname.startsWith(item.to);

  return (
    <ActivePill active={active}>
      <Link
        to={item.to}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
        aria-current={active ? "page" : undefined}
      >
        <span className={cn(active ? "text-primary" : "text-muted-foreground")}>{item.icon}</span>
        <span>{item.label}</span>
        {typeof item.badge === "number" && item.badge > 0 ? (
          <Badge variant="secondary" className="ml-1">
            {item.badge}
          </Badge>
        ) : null}
      </Link>
    </ActivePill>
  );
}

function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: Array<{ label: string; hint?: string; to: string }>;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(s) || i.to.toLowerCase().includes(s) || (i.hint ?? "").toLowerCase().includes(s)
    );
  }, [q, items]);

  // Reset search when opening/closing (UX)
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <CommandIcon className="h-5 w-5" />
            Quick Search
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search pages (e.g., consent, records, scan)"
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <Separator />

        <div className="max-h-[320px] overflow-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No results.</div>
          ) : (
            filtered.map((i) => (
              <button
                key={i.to}
                onClick={() => {
                  onOpenChange(false);
                  navigate(i.to);
                }}
                className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors"
              >
                <span className="font-medium">{i.label}</span>
                <span className="text-xs text-muted-foreground">{i.hint ?? i.to}</span>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
          <span>Tip: Use Ctrl/⌘ + K and Enter (click works too).</span>
          <span className="font-mono">Esc</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Navbar() {
  const { user, role, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ✅ FIX: destructure pathname for string usage. [file:484]
  const { pathname } = useLocation();

  // Replace with real counts from Supabase later pending consents etc.
  const pendingConsents = role === "patient" ? 2 : 0;

  const [cmdOpen, setCmdOpen] = useState(false);

  // Ctrl/Cmd + K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const displayName = useMemo(() => {
    const email = user?.email ?? "";
    const head = email.split("@")[0] ?? "";
    return head || "User";
  }, [user?.email]);

  const roleLabel = role === "doctor" ? "Doctor" : role === "patient" ? "Patient" : "User";

  const links: NavLinkItem[] = useMemo(() => {
    if (!user) {
      return [
        {
          to: "/dashboard",
          label: t("nav.dashboard", { defaultValue: "Dashboard" }),
          icon: <Activity className="h-4 w-4" />,
        },
      ];
    }

    if (role === "doctor") {
      return [
        {
          to: "/dashboard",
          label: t("nav.dashboard", { defaultValue: "Dashboard" }),
          icon: <Activity className="h-4 w-4" />,
        },
        {
          to: "/doctor/scan",
          label: t("doctor.scan", { defaultValue: "Scan" }),
          icon: <ShieldCheck className="h-4 w-4" />,
        },
        {
          to: "/doctor/join-hospital",
          label: "Join Hospital",
          icon: <Building2 className="h-4 w-4" />,
        },
      ];
    }

    if (role === "hospital") {
      return [
        {
          to: "/hospital/dashboard",
          label: "Dashboard",
          icon: <Activity className="h-4 w-4" />,
        },
        {
          to: "/hospital/scan",
          label: "Scan",
          icon: <QrCode className="h-4 w-4" />,
        },
        {
          to: "/hospital/patients",
          label: "Patients",
          icon: <Users className="h-4 w-4" />,
        },
        {
          to: "/hospital/requests",
          label: "Requests",
          icon: <ShieldCheck className="h-4 w-4" />,
        },
        {
          to: "/hospital/profile",
          label: "Profile",
          icon: <Building2 className="h-4 w-4" />,
        },
      ];
    }

    if (role === "pharmacist") {
      return [
        {
          to: "/pharmacist/dashboard",
          label: "Dashboard",
          icon: <Activity className="h-4 w-4" />,
        },
      ];
    }

    // patient
    return [
      {
        to: "/dashboard",
        label: t("nav.dashboard", { defaultValue: "Dashboard" }),
        icon: <Activity className="h-4 w-4" />,
      },
      {
        to: "/patient/consent",
        label: t("nav.consents", { defaultValue: "Consents" }),
        icon: <ShieldCheck className="h-4 w-4" />,
        badge: pendingConsents,
      },
      {
        to: "/patient/records",
        label: t("nav.records", { defaultValue: "Records" }),
        icon: <FileText className="h-4 w-4" />,
      },
      {
        to: "/patient/pharmacy-chat",
        label: "Expert Pharmacy",
        icon: <ShieldCheck className="h-4 w-4" />, // Using ShieldCheck or Pill if available
      },
    ];
  }, [user, role, pendingConsents, t]);

  const cmdItems = useMemo(() => {
    const base = [
      { label: "Dashboard", to: "/dashboard", hint: "Home stats" },

      // patient
      { label: "Consents", to: "/patient/consent", hint: "Approve requests" },
      { label: "Records", to: "/patient/records", hint: "My records" },

      // doctor
      { label: "Doctor Scan", to: "/doctor/scan", hint: "Request access" },
      { label: "Join Hospital", to: "/doctor/join-hospital", hint: "Request membership" },

      // hospital
      { label: "Hospital Dashboard", to: "/hospital/dashboard", hint: "Overview" },
      { label: "Hospital Scan", to: "/hospital/scan", hint: "Request patient consent" },
      { label: "Hospital Patients", to: "/hospital/patients", hint: "Approved patients" },
      { label: "Hospital Requests", to: "/hospital/requests", hint: "Approve doctors" },
      { label: "Hospital Profile", to: "/hospital/profile", hint: "Hospital UID / QR" },
    ];

    return base.filter((i) => {
      if (!user) return i.to === "/dashboard";
      if (role === "doctor") return !i.to.startsWith("/patient") && !i.to.startsWith("/hospital");
      if (role === "hospital") return !i.to.startsWith("/patient") && !i.to.startsWith("/doctor");
      if (role === "patient") return !i.to.startsWith("/doctor") && !i.to.startsWith("/hospital");
      if (role === "pharmacist") return i.to.startsWith("/pharmacist");
      return true;
    });
  }, [user, role]);


  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/") || pathname.startsWith(to);

  // Auto-hide logic
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const showNavbar = () => {
      setIsVisible(true);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setIsVisible(false), 5000);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 50) showNavbar();
    };

    showNavbar();
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const initials = useMemo(() => {
    const s = (displayName || "U").trim();
    return s.slice(0, 2).toUpperCase();
  }, [displayName]);

  return (
    <>
      <motion.header
        className="fixed top-0 inset-x-0 z-50"
        initial={{ y: 0 }}
        animate={{ y: isVisible ? 0 : -100 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <div className="glass-panel">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-3">
            {/* Brand */}
            <Link to="/" className="flex items-center gap-3 min-w-[180px] group">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/30 blur-lg rounded-full group-hover:bg-primary/50 transition-all duration-500" />
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shadow-lg shadow-primary/25"
                >
                  <Activity className="w-5 h-5 text-white" />
                </motion.div>
              </div>

              <div className="leading-tight">
                <div className="font-bold font-heading text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-teal-600 dark:from-blue-400 dark:to-teal-300">
                  MyHealthChain
                </div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 hidden sm:block">
                  Secure & Decentralized
                </div>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1 p-1">
              {links.map((l) => (
                <TopNavItem key={l.to} item={l} />
              ))}
            </nav>

            {/* Right */}
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />

              {/* Command button desktop */}
              <button
                onClick={() => setCmdOpen(true)}
                className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border bg-background/50 hover:bg-background/80 transition-all duration-200"
                aria-label="Open search"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Search</span>
                <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </button>

              {/* Notifications */}
              {user ? (
                <button
                  className="relative h-10 w-10 rounded-xl border bg-background/50 hover:bg-background/80 transition-all flex items-center justify-center"
                  aria-label="Notifications"
                  onClick={() => navigate(role === "patient" ? "/patient/consent" : "/dashboard")}
                >
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  {pendingConsents > 0 ? (
                    <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-sm flex items-center justify-center">
                      {pendingConsents}
                    </span>
                  ) : null}
                </button>
              ) : null}

              {/* Mobile menu */}
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>

                  <SheetContent side="right" className="w-[330px]">
                    <SheetHeader>
                      <SheetTitle className="flex items-center justify-between font-heading">
                        Navigation
                        <div className="flex items-center gap-2">
                          <ThemeToggle />
                          <button
                            onClick={() => setCmdOpen(true)}
                            className="h-9 w-9 rounded-xl border bg-background hover:bg-muted/40 transition-colors flex items-center justify-center"
                            aria-label="Search"
                          >
                            <Search className="h-4 w-4" />
                          </button>
                        </div>
                      </SheetTitle>
                    </SheetHeader>

                    <div className="mt-8 space-y-2">
                      {links.map((l) => (
                        <Link
                          key={l.to}
                          to={l.to}
                          className={cn(
                            "flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border transition-all duration-200",
                            isActive(l.to)
                              ? "bg-primary/10 border-primary/20 text-primary"
                              : "hover:bg-muted/40 border-transparent hover:border-border"
                          )}
                        >
                          <span className="flex items-center gap-3">
                            {l.icon}
                            <span className="font-medium">{l.label}</span>
                          </span>

                          {typeof l.badge === "number" && l.badge > 0 ? (
                            <Badge variant="destructive" className="rounded-full px-2">
                              {l.badge}
                            </Badge>
                          ) : null}
                        </Link>
                      ))}
                    </div>

                    <Separator className="my-6" />

                    {user ? (
                      <div className="space-y-4">
                        <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
                          <div className="text-sm font-semibold text-foreground">{displayName}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
                            {roleLabel}
                          </div>
                          {user.email ? (
                            <div className="text-xs text-muted-foreground truncate mt-2 font-mono bg-background/50 p-2 rounded-lg border">
                              {user.email}
                            </div>
                          ) : null}
                        </div>

                        <Button
                          variant="destructive"
                          className="w-full gap-2 rounded-xl h-11"
                          onClick={signOut}
                        >
                          <LogOut className="h-4 w-4" />
                          Logout
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <Link to="/login">
                          <Button variant="outline" className="w-full rounded-xl h-11">
                            Login
                          </Button>
                        </Link>
                        <Link to="/signup">
                          <Button className="w-full rounded-xl h-11 gradient-primary border-0">
                            Sign Up
                          </Button>
                        </Link>
                      </div>
                    )}
                  </SheetContent>
                </Sheet>
              </div>

              {/* Desktop profile */}
              <div className="hidden md:flex">
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-3 rounded-2xl border bg-background/50 hover:bg-background/80 transition-all p-1.5 pr-4 group">
                        <Avatar className="h-9 w-9 ring-2 ring-background shadow-sm">
                          <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden lg:block text-left">
                          <div className="text-sm font-semibold leading-none group-hover:text-primary transition-colors">
                            {displayName}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mt-1">
                            {roleLabel}
                          </div>
                        </div>
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl glass-card">
                      <DropdownMenuLabel className="p-2">
                        <div className="text-sm font-semibold">{displayName}</div>
                        <div className="text-xs text-muted-foreground truncate font-normal opacity-80">
                          {user.email}
                        </div>
                      </DropdownMenuLabel>

                      <DropdownMenuSeparator className="my-1" />

                      <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                        <Link to="/dashboard">
                          <Activity className="mr-2 h-4 w-4" />
                          Dashboard
                        </Link>
                      </DropdownMenuItem>

                      {role === "patient" ? (
                        <>
                          <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                            <Link to="/patient/consent">
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Consents
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                            <Link to="/patient/records">
                              <FileText className="mr-2 h-4 w-4" />
                              Records
                            </Link>
                          </DropdownMenuItem>
                        </>
                      ) : null}

                      {role === "doctor" ? (
                        <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                          <Link to="/doctor/scan">
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Scan
                          </Link>
                        </DropdownMenuItem>
                      ) : null}

                      {role === "hospital" ? (
                        <>
                          <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                            <Link to="/hospital/dashboard">
                              <Activity className="mr-2 h-4 w-4" />
                              Hospital Dashboard
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                            <Link to="/hospital/scan">
                              <QrCode className="mr-2 h-4 w-4" />
                              Scan
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                            <Link to="/hospital/patients">
                              <Users className="mr-2 h-4 w-4" />
                              Patients
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                            <Link to="/hospital/requests">
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Requests
                            </Link>
                          </DropdownMenuItem>

                          <DropdownMenuItem asChild className="rounded-lg cursor-pointer py-2.5">
                            <Link to="/hospital/profile">
                              <Building2 className="mr-2 h-4 w-4" />
                              Profile
                            </Link>
                          </DropdownMenuItem>
                        </>
                      ) : null}


                      <DropdownMenuSeparator className="my-1" />

                      <DropdownMenuItem
                        onClick={() => setCmdOpen(true)}
                        className="rounded-lg cursor-pointer py-2.5"
                      >
                        <CommandIcon className="mr-2 h-4 w-4" />
                        Search
                        <span className="ml-auto text-xs text-muted-foreground opacity-70">K</span>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="my-1" />

                      <DropdownMenuItem
                        onClick={signOut}
                        className="text-destructive rounded-lg cursor-pointer py-2.5 focus:bg-destructive/10"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex items-center gap-3">
                    <Link to="/login">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                        Login
                      </Button>
                    </Link>
                    <Link to="/signup">
                      <Button size="sm" className="rounded-xl gradient-primary border-0 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                        Sign Up
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} items={cmdItems} />
    </>
  );
}
