import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, Loader2, Sparkles, BarChart3, Mic, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  signIn,
  signInWithGoogle,
  validateEmail,
} from "@/lib/auth";
import { isDesktopApp } from "@/lib/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const features = [
  { icon: Sparkles, label: "AI Summaries" },
  { icon: Mic, label: "Smart Transcription" },
  { icon: BarChart3, label: "Meeting Analytics" },
];

const orbitIcons = [
  { icon: Sparkles, size: 44, orbitRadius: 90, speed: 18, delay: 0 },
  { icon: BarChart3, size: 38, orbitRadius: 120, speed: 22, delay: 3 },
  { icon: Mic, size: 36, orbitRadius: 70, speed: 15, delay: 6 },
  { icon: Lock, size: 32, orbitRadius: 140, speed: 25, delay: 9 },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const desktopMode = isDesktopApp();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, authLoading, navigate, redirectTo]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const dots = useMemo(
    () =>
      Array.from({ length: 50 }).map(() => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        duration: 3 + Math.random() * 4,
        delay: Math.random() * 3,
        size: Math.random() > 0.7 ? 2 : 1,
      })),
    [],
  );

  const showWelcomeToast = async (userId?: string, fallbackName = "there") => {
    let displayName = fallbackName;
    if (userId) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
      if (profile?.full_name) displayName = profile.full_name;
    }

    toast.custom(() => (
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-5 py-4 shadow-lg">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="text-sm font-medium text-foreground">Welcome back, {displayName}!</span>
      </div>
    ), { duration: 4000 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    const { data, error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      if (error.message === "Email not confirmed") {
        toast.error("Your email is not verified. Please check your inbox for a verification link, or sign up with a valid email address.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    await showWelcomeToast(data?.user?.id, email.split("@")[0]);
    navigate(redirectTo);
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      if (desktopMode) {
        toast("Continue with Google in your browser. WrapUp will return here automatically when sign-in finishes.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in could not be started right now.");
    }
  };

  return (
    <div className="dark min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {dots.map((d, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-primary/20"
            style={{ left: d.left, top: d.top, width: d.size, height: d.size }}
            animate={{ y: [0, -30, 0], opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: d.duration, repeat: Infinity, delay: d.delay }}
          />
        ))}
      </div>

      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-4xl"
      >
        <div className="rounded-2xl border border-border/50 bg-card/30 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="grid md:grid-cols-2">
            {/* Left — Branding + Orbiting icons */}
            <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center relative min-h-[420px]">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Link to="/" className="text-3xl font-bold gradient-text">🎙️ WrapUp</Link>
                <p className="mt-4 text-muted-foreground text-sm max-w-xs mx-auto">
                  Transform your meetings with intelligent AI-powered tools built for productivity
                </p>
              </motion.div>

              {/* Orbiting icons */}
              <div className="relative w-56 h-56 mt-6 mx-auto">
                {/* Center icon */}
                <motion.div
                  className="absolute inset-0 m-auto w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-7 h-7 text-primary" />
                </motion.div>

                {orbitIcons.map(({ icon: Icon, size, orbitRadius, speed, delay }, idx) => (
                  <motion.div
                    key={idx}
                    className="absolute"
                    style={{ width: size, height: size, top: "50%", left: "50%", marginTop: -size / 2, marginLeft: -size / 2 }}
                  >
                    <motion.div
                      animate={{
                        x: [orbitRadius * Math.cos(0), orbitRadius * Math.cos(Math.PI / 2), orbitRadius * Math.cos(Math.PI), orbitRadius * Math.cos((3 * Math.PI) / 2), orbitRadius * Math.cos(0)],
                        y: [orbitRadius * Math.sin(0), orbitRadius * Math.sin(Math.PI / 2), orbitRadius * Math.sin(Math.PI), orbitRadius * Math.sin((3 * Math.PI) / 2), orbitRadius * Math.sin(0)],
                      }}
                      transition={{ duration: speed, repeat: Infinity, ease: "linear", delay }}
                      className="rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center"
                      style={{ width: size, height: size }}
                    >
                      <Icon className="text-primary" style={{ width: size * 0.5, height: size * 0.5 }} />
                    </motion.div>
                  </motion.div>
                ))}
              </div>

              {/* Feature badges */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex gap-8 mt-4">
                {features.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right — Form */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="p-8 md:p-10 bg-card/50 border-l border-border/30">
              <h1 className="text-xl font-bold mb-1">Welcome Back</h1>
              <p className="text-sm text-muted-foreground mb-6">Sign in to your account</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(""); }} className="pl-9 bg-background/50 border-border/50" required />
                  </div>
                  {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-9 bg-background/50 border-border/50" required />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox id="remember" className="h-3.5 w-3.5" />
                    <label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer">Remember me</label>
                  </div>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot your password?</Link>
                </div>

                <Button type="submit" className="w-full gradient-bg text-primary-foreground font-semibold" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Sign In
                  {!loading && <ArrowRight className="h-4 w-4 ml-1" />}
                </Button>
              </form>

              <div className="mt-4">
                <Button
                  variant="outline"
                  className="w-full bg-background/50"
                  onClick={() => void handleGoogleSignIn()}
                >
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  Sign in with Google
                </Button>
              </div>

              <p className="text-center text-sm text-muted-foreground mt-5">
                Don't have an account?{" "}
                <Link to="/signup" className="text-primary hover:underline font-medium">Sign up</Link>
              </p>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
