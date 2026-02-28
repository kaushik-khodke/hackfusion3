import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Lock, Loader2, ShieldCheck, AlertCircle } from "lucide-react";

const updateSchema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

type UpdateFormData = z.infer<typeof updateSchema>;

export function UpdatePassword() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [success, setSuccess] = useState(false);

    // Check if we have an active session for recovery
    useEffect(() => {
        let retryCount = 0;
        const maxRetries = 10;
        const retryDelay = 200; // ms

        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            // If we've exhausted retries and still no session, show alert
            // But also check if there's an access_token in the URL hash which Supabase uses
            const hasHashToken = window.location.hash.includes('access_token=');

            if (!session && !hasHashToken && retryCount < maxRetries) {
                retryCount++;
                setTimeout(checkSession, retryDelay);
                return;
            }

            if (!session && !hasHashToken) {
                setError("Recovery session could not be established. Your link may be invalid or expired.");
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "PASSWORD_RECOVERY") {
                console.log("✅ PASSWORD_RECOVERY event received");
                setError(""); // Clear any "missing session" error
            }
            if (session) {
                setError("");
            }
        });

        checkSession();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<UpdateFormData>({
        resolver: zodResolver(updateSchema),
    });

    const onSubmit = async (data: UpdateFormData) => {
        setIsLoading(true);
        setError("");

        try {
            const { error } = await supabase.auth.updateUser({
                password: data.password,
            });

            if (error) throw error;
            setSuccess(true);

            // Delay redirect to show success
            setTimeout(() => {
                navigate("/login");
            }, 3000);
        } catch (err: any) {
            setError(err.message || "Failed to update password");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4">
            {/* Background elements */}
            <div className="absolute inset-0 -z-10 bg-background" />
            <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-[0.12]" />
            <div className="absolute top-0 right-0 w-[55%] h-[75%] rounded-full bg-primary/12 blur-3xl -z-10 opacity-90" />
            <div className="absolute bottom-0 left-0 w-[45%] h-[55%] rounded-full bg-teal-400/12 blur-3xl -z-10" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-md"
            >
                <Card className="glass-card border-primary/10 shadow-xl shadow-primary/5 rounded-2xl overflow-hidden">
                    <CardHeader className="pb-4 pt-8 px-8 text-center sm:text-left">
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-teal-500/20 flex items-center justify-center">
                                <Lock className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-heading font-bold">
                                    Update Password
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Set a new secure password
                                </p>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="px-8 pb-8 pt-2">
                        {success ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-center space-y-4 py-4"
                            >
                                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/10 text-teal-600 mb-2">
                                    <ShieldCheck className="h-8 w-8" />
                                </div>
                                <h3 className="text-lg font-semibold">Password updated!</h3>
                                <p className="text-sm text-muted-foreground">
                                    Your password has been changed successfully. Redirecting to login...
                                </p>
                            </motion.div>
                        ) : (
                            <>
                                {error && (
                                    <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex gap-2 items-start">
                                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                                    <div>
                                        <label className="text-sm font-medium text-foreground block mb-1.5">
                                            New Password
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                            <Input
                                                type="password"
                                                placeholder="••••••••"
                                                className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background transition-colors"
                                                {...register("password")}
                                            />
                                        </div>
                                        {errors.password && (
                                            <p className="text-xs text-destructive mt-1.5">
                                                {String(errors.password.message)}
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-foreground block mb-1.5">
                                            Confirm New Password
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                            <Input
                                                type="password"
                                                placeholder="••••••••"
                                                className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background transition-colors"
                                                {...register("confirmPassword")}
                                            />
                                        </div>
                                        {errors.confirmPassword && (
                                            <p className="text-xs text-destructive mt-1.5">
                                                {String(errors.confirmPassword.message)}
                                            </p>
                                        )}
                                    </div>

                                    <Button
                                        type="submit"
                                        className="w-full h-12 rounded-xl gradient-primary text-base font-semibold gap-2 mt-2"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Updating...
                                            </>
                                        ) : (
                                            <>
                                                Update Password
                                            </>
                                        )}
                                    </Button>
                                </form>
                            </>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
