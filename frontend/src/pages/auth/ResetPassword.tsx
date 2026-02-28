import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, Loader2, KeyRound } from "lucide-react";

const resetSchema = z.object({
    email: z.string().email("Invalid email"),
});

type ResetFormData = z.infer<typeof resetSchema>;

export function ResetPassword() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [success, setSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ResetFormData>({
        resolver: zodResolver(resetSchema),
    });

    const onSubmit = async (data: ResetFormData) => {
        setIsLoading(true);
        setError("");

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
                redirectTo: `${window.location.origin}/update-password`,
            });

            if (error) throw error;
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || "Failed to send reset link");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4">
            {/* Background elements similar to Login */}
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
                                <KeyRound className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-heading font-bold">
                                    Reset Password
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Get a link to regain access
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
                                    <Mail className="h-8 w-8" />
                                </div>
                                <h3 className="text-lg font-semibold">Check your email</h3>
                                <p className="text-sm text-muted-foreground">
                                    We've sent a password reset link to your email address.
                                </p>
                                <Button
                                    variant="outline"
                                    className="w-full rounded-xl gap-2 mt-4"
                                    onClick={() => navigate("/login")}
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Back to Login
                                </Button>
                            </motion.div>
                        ) : (
                            <>
                                {error && (
                                    <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                                    <div>
                                        <label className="text-sm font-medium text-foreground block mb-1.5">
                                            Email Address
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                            <Input
                                                placeholder="you@example.com"
                                                className="pl-10 h-11 rounded-xl border-border/80 bg-muted/30 focus:bg-background transition-colors"
                                                {...register("email")}
                                            />
                                        </div>
                                        {errors.email && (
                                            <p className="text-xs text-destructive mt-1.5">
                                                {String(errors.email.message)}
                                            </p>
                                        )}
                                    </div>

                                    <Button
                                        type="submit"
                                        className="w-full h-12 rounded-xl gradient-primary text-base font-semibold gap-2"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Sending link...
                                            </>
                                        ) : (
                                            <>
                                                Send Reset Link
                                            </>
                                        )}
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        type="button"
                                        className="w-full rounded-xl gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                        onClick={() => navigate("/login")}
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        Back to Login
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
