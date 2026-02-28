import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LogIn, Mail, Lock, ArrowRight, Shield, Zap, Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState<string>("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    if (isLoading) return;

    setIsLoading(true);
    setPageError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      navigate("/dashboard");
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-background" />
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.12]" />
      <div className="absolute top-0 right-0 w-[55%] h-[75%] rounded-full bg-primary/12 blur-3xl -z-10 opacity-90" />
      <div className="absolute bottom-0 left-0 w-[45%] h-[55%] rounded-full bg-teal-400/12 blur-3xl -z-10" />
      <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-primary/30 -z-10" />
      <div className="absolute bottom-1/3 right-1/3 w-1.5 h-1.5 rounded-full bg-teal-500/40 -z-10" />
      <div className="absolute inset-0 -z-10 mask-radial-faded bg-background/20" />

      {/* Left: Branding (visible on larger screens) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-center px-12 xl:px-20">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary mb-8">
            <Shield className="h-4 w-4" />
            Secure health records
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold font-heading tracking-tight text-foreground mb-4">
            Welcome back to{" "}
            <span className="bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
              MyHealthChain
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-sm">
            Sign in to access your encrypted health records and AI-assisted insights.
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
      <div className="flex-1 flex items-center justify-center px-4 py-12 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <Card className="glass-card border-primary/10 shadow-xl shadow-primary/5 rounded-2xl overflow-hidden">
            <CardHeader className="pb-4 pt-8 px-8">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-teal-500/20 flex items-center justify-center">
                  <LogIn className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-heading font-bold">
                    {t("auth.login")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Access your records securely
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-8 pb-8 pt-2">
              {pageError ? (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {pageError}
                </motion.div>
              ) : null}

              <form onSubmit={handleSubmit(onSubmit)}>
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="space-y-5"
                >
                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-foreground block mb-1.5">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="you@example.com"
                        autoComplete="email"
                        className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background transition-colors"
                        {...register("email")}
                      />
                    </div>
                    {errors.email ? (
                      <p className="text-xs text-destructive mt-1.5">
                        {String(errors.email.message)}
                      </p>
                    ) : null}
                  </motion.div>

                  <motion.div variants={item}>
                    <label className="text-sm font-medium text-foreground block mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background transition-colors"
                        {...register("password")}
                      />
                    </div>
                    {errors.password ? (
                      <p className="text-xs text-destructive mt-1.5">
                        {String(errors.password.message)}
                      </p>
                    ) : null}
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        className="text-xs text-primary/80 hover:text-primary transition-colors font-medium"
                        onClick={() => navigate("/reset-password")}
                      >
                        {t("auth.forgot_password")}
                      </button>
                    </div>
                  </motion.div>

                  <motion.div variants={item}>
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-xl gradient-primary text-base font-semibold gap-2 mt-1"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          {t("auth.login")}
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {t("auth.no_account")}{" "}
                <button
                  type="button"
                  className="text-primary font-semibold hover:underline focus:outline-none focus:underline"
                  onClick={() => !isLoading && navigate("/signup")}
                >
                  {t("auth.signup")}
                </button>
              </p>

              {/* Demo credentials */}
              <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {/* Demo credentials */}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-background/80 border border-border/50 px-3 py-2.5">
                    {/* <p className="text-xs font-medium text-muted-foreground mb-1">Patient</p> */}
                    <p className="text-sm font-mono text-foreground truncate" title="patient@demo.com">
                      {/* patient@demo.com */}
                    </p>
                    {/* <p className="text-xs font-mono text-muted-foreground">Demo@1234</p> */}
                  </div>
                  <div className="rounded-lg bg-background/80 border border-border/50 px-3 py-2.5">
                    {/* <p className="text-xs font-medium text-muted-foreground mb-1">Doctor</p> */}
                    <p className="text-sm font-mono text-foreground truncate" title="doctor@demo.com">
                      {/* doctor@demo.com */}
                    </p>
                    {/* <p className="text-xs font-mono text-muted-foreground">Demo@1234</p> */}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
