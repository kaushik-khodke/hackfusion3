import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  UserPlus,
  Stethoscope,
  Mail,
  Lock,
  User,
  Phone,
  Building2,
  BadgeCheck,
  ArrowRight,
  Shield,
  Zap,
  Loader2,
} from "lucide-react";

const signupSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  hospital: z.string().optional(),
  licenseId: z.string().optional(),
  address: z.string().optional(),
});

type SignupFormData = z.infer<typeof signupSchema>;

function generateUHID() {
  const base = Math.floor(1000000000 + Math.random() * 9000000000);
  return String(base);
}

function generateHospitalUID() {
  const base = Math.floor(100000000 + Math.random() * 900000000);
  return `HOSP${base}`;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const roleParam = searchParams.get("role");
  const initialRole: "patient" | "doctor" | "hospital" | "pharmacist" =
    roleParam === "doctor" ? "doctor" :
      roleParam === "hospital" ? "hospital" :
        roleParam === "pharmacist" ? "pharmacist" : "patient";

  const [role, setRole] = useState<"patient" | "doctor" | "hospital" | "pharmacist">(initialRole);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [pageError, setPageError] = useState<string>("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const password = watch("password");

  const passwordStrength = useMemo(() => {
    const pwd = password || "";
    if (!pwd) return { strength: 0, label: "" };

    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^a-zA-Z\d]/.test(pwd)) strength++;

    const labels = ["", t("auth.weak"), t("auth.medium"), t("auth.strong"), t("auth.strong")];
    return { strength, label: labels[strength] };
  }, [password, t]);

  const startCooldown = (sec: number) => {
    setCooldownSeconds(sec);
    const timer = setInterval(() => {
      setCooldownSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const onSubmit = async (data: SignupFormData) => {
    if (isLoading || cooldownSeconds > 0) return;

    setPageError("");

    // Validate hospital name is provided for hospital role
    if (role === "hospital" && !data.hospital?.trim()) {
      setPageError("Hospital name is required");
      return;
    }

    const last = Number(localStorage.getItem("signup_last_ts") || "0");
    const now = Date.now();
    const waitMs = 12000 - (now - last);

    if (waitMs > 0) {
      startCooldown(Math.ceil(waitMs / 1000));
      setPageError(`Please wait ${Math.ceil(waitMs / 1000)} seconds and try again.`);
      return;
    }

    localStorage.setItem("signup_last_ts", String(now));
    setIsLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            role,
            full_name: data.fullName,
            phone: data.phone,
            hospital_name: data.hospital, // Sent for both doctor (optional) and hospital (required)
            license_id: data.licenseId,
            address: data.address,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (authError) {
        if ((authError as { status?: number }).status === 429) {
          startCooldown(12);
          throw new Error("For security purposes, you can only request this after 12 seconds.");
        }
        throw authError;
      }

      if (!authData.user) throw new Error("Signup succeeded but no user returned.");

      if (!authData.session) {
        alert("Check your email to confirm your account, then login.");
        reset();
        navigate("/login");
        return;
      }

      // Insert into auth.profiles because there is no Supabase trigger handling this
      // Only runs if session exists (user is auto-logged in)
      const { error: profileError } = await supabase.from("profiles").insert({
        id: authData.user.id,
        role: role === 'hospital' ? 'doctor' : role, // Database enum strictly requires 'doctor' or 'patient'
        full_name: data.fullName,
        phone: data.phone,
      });

      if (profileError) {
        throw new Error("Failed to create profile: " + profileError.message);
      }

      // If doctor or hospital, insert specific record types
      if (role === "doctor" || role === "hospital") {
        const { error: docError } = await supabase.from("doctors").insert({
          id: authData.user.id,
          hospital: data.hospital,
          license_id: data.licenseId,
          verified: false
        });
        if (docError) {
          throw new Error("Failed to create doctor profile: " + docError.message);
        }
      }

      navigate("/dashboard");
    } catch (error: unknown) {
      console.error("Signup error:", error);
      const errorMessage = error instanceof Error ? error.message : "Signup failed";
      setPageError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-background" />
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.12]" />
      <div className="absolute top-0 left-0 w-[45%] h-[60%] rounded-full bg-primary/10 blur-3xl -z-10" />
      <div className="absolute bottom-0 right-0 w-[50%] h-[55%] rounded-full bg-teal-400/12 blur-3xl -z-10" />
      <div className="absolute inset-0 -z-10 mask-radial-faded bg-background/20" />

      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-center px-12 xl:px-20">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary mb-8">
            <UserPlus className="h-4 w-4" />
            Join MyHealthChain
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold font-heading tracking-tight text-foreground mb-4">
            Create your{" "}
            <span className="bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
              account
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-sm">
            Sign up as a patient or doctor to manage health records securely with end-to-end encryption.
          </p>
          <ul className="space-y-4">
            {[
              { icon: Shield, text: "End-to-end encryption" },
              { icon: Zap, text: "AI-powered health assistant" },
            ].map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 text-muted-foreground"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <span>{text}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 lg:py-16 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-xl"
        >
          <Card className="glass-card border-primary/10 shadow-xl shadow-primary/5 rounded-2xl overflow-hidden">
            <CardHeader className="pb-4 pt-8 px-8">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-teal-500/20 flex items-center justify-center">
                  {role === "doctor" ? (
                    <Stethoscope className="w-6 h-6 text-primary" />
                  ) : role === "hospital" ? (
                    <Building2 className="w-6 h-6 text-primary" />
                  ) : role === "pharmacist" ? (
                    <BadgeCheck className="w-6 h-6 text-primary" />
                  ) : (
                    <UserPlus className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-2xl font-heading font-bold">
                    {t("auth.signup")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Create your account and start managing records
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-8 pb-8 pt-2">
              {/* Role switch */}
              <div className="flex gap-2 mb-6 p-1 rounded-xl bg-muted/50 border border-border/50">
                <button
                  type="button"
                  onClick={() => setRole("patient")}
                  disabled={isLoading}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${role === "patient"
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <User className="h-4 w-4" />
                  {t("auth.role_patient")}
                </button>
                <button
                  type="button"
                  onClick={() => setRole("doctor")}
                  disabled={isLoading}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${role === "doctor"
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Stethoscope className="h-4 w-4" />
                  {t("auth.role_doctor")}
                </button>
                <button
                  type="button"
                  onClick={() => setRole("hospital")}
                  disabled={isLoading}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${role === "hospital"
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Building2 className="h-4 w-4" />
                  Hospital
                </button>
                <button
                  type="button"
                  onClick={() => setRole("pharmacist")}
                  disabled={isLoading}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${role === "pharmacist"
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <BadgeCheck className="h-4 w-4" />
                  Pharmacist
                </button>
              </div>

              {pageError ? (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {pageError}
                </motion.div>
              ) : null}

              {cooldownSeconds > 0 ? (
                <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                  Please wait {cooldownSeconds}s before trying again.
                </div>
              ) : null}

              <form onSubmit={handleSubmit(onSubmit)}>
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="space-y-5"
                >
                  <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        {role === "hospital" ? "Contact Person" : "Full name"}
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={role === "hospital" ? "Contact person name" : "Your name"}
                          className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                          {...register("fullName")}
                        />
                      </div>
                      {errors.fullName ? (
                        <p className="text-xs text-destructive mt-1.5">{String(errors.fullName.message)}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="+91XXXXXXXXXX"
                          className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                          {...register("phone")}
                        />
                      </div>
                      {errors.phone ? (
                        <p className="text-xs text-destructive mt-1.5">{String(errors.phone.message)}</p>
                      ) : null}
                    </div>
                  </motion.div>

                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-foreground block mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="you@example.com"
                        type="email"
                        className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                        {...register("email")}
                      />
                    </div>
                    {errors.email ? (
                      <p className="text-xs text-destructive mt-1.5">{String(errors.email.message)}</p>
                    ) : null}
                  </motion.div>

                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-foreground block mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                        {...register("password")}
                      />
                    </div>
                    {errors.password ? (
                      <p className="text-xs text-destructive mt-1.5">{String(errors.password.message)}</p>
                    ) : null}
                    {password ? (
                      <div className="mt-2">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= passwordStrength.strength ? "bg-primary" : "bg-muted"
                                }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("auth.password_strength")}: {passwordStrength.label}
                        </p>
                      </div>
                    ) : null}
                  </motion.div>

                  {role === "doctor" ? (
                    <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">Hospital (optional)</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Hospital name"
                            className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                            {...register("hospital")}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">License ID (optional)</label>
                        <div className="relative">
                          <BadgeCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="License ID"
                            className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                            {...register("licenseId")}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ) : null}

                  {role === "hospital" ? (
                    <motion.div variants={item} className="space-y-5">
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">Hospital Name *</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Hospital name"
                            className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                            {...register("hospital")}
                          />
                        </div>
                        {errors.hospital ? (
                          <p className="text-xs text-destructive mt-1.5">{String(errors.hospital.message)}</p>
                        ) : null}
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">Address (optional)</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Street, City, State, ZIP"
                            className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background"
                            {...register("address")}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ) : null}

                  <motion.div variants={item}>
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-xl gradient-primary text-base font-semibold gap-2 mt-1"
                      disabled={isLoading || cooldownSeconds > 0}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        <>
                          {t("auth.signup")}
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {t("auth.have_account")}{" "}
                <button
                  type="button"
                  className="text-primary font-semibold hover:underline focus:outline-none focus:underline"
                  onClick={() => !isLoading && navigate("/login")}
                >
                  {t("auth.login")}
                </button>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
