import React, { useState } from "react";
import { GalleryVerticalEnd } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { authClient } from "@/utils/auth-client";
import { getSafeRedirectUrl } from "@/utils/safe-redirect";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();

  const handleSocialLogin = async (provider: "google" | "apple") => {
    setIsSocialLoading(provider);
    setError("");
    try {
      const res = await authClient.signIn.social({ 
        provider,
        callbackURL: window.location.origin 
      });
      if (res.error) {
        if (res.error.status === 403 && res.error.message?.includes("two_factor")) {
          setTwoFactorStep(true);
        } else {
          setError(res.error.message || `Could not sign in with ${provider}.`);
        }
      }
    } catch {
      setError(`Something went wrong linking with ${provider}.`);
    } finally {
      setIsSocialLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      if (twoFactorStep) {
        const res = await authClient.twoFactor.verifyOtp({
          code: otp
        });
        if (res.error) {
           setError(res.error.message || "Invalid 2FA code.");
           return;
        }
        const params = new URLSearchParams(window.location.search);
        navigate(getSafeRedirectUrl(params.get("redirect")), { replace: true });
        return;
      }

      const res = await authClient.signIn.email({ email, password });
      if (res.error) {
        if (res.error.status === 403 && res.error.message?.includes("two_factor")) {
          setTwoFactorStep(true);
        } else {
          setError(res.error.message || "Invalid email or password.");
        }
      } else {
        const params = new URLSearchParams(window.location.search);
        const redirect = getSafeRedirectUrl(params.get("redirect"));
        window.location.href = redirect;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-3">
             <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
               <GalleryVerticalEnd className="size-7" />
            </div>
            <div className="space-y-1 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-gradient">
                Welcome back
              </h1>
              <p className="text-sm text-balance text-muted-foreground">
                Enter your credentials to access your account.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {!twoFactorStep ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="email" className="text-sm font-semibold ml-1">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    className="h-11 bg-background/50 border-primary/20 focus-visible:ring-primary focus-visible:border-primary transition-all"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-primary hover:underline underline-offset-4 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 bg-background/50 border-primary/20 focus-visible:ring-primary focus-visible:border-primary transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="space-y-2 text-center">
                  <Label htmlFor="otp" className="text-base font-bold text-gradient">2FA Verification</Label>
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code from your app or email.
                  </p>
                </div>
                <Input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  className="h-14 text-center text-3xl tracking-[0.3em] font-mono font-bold bg-background/50 border-primary/20 focus-visible:ring-primary focus-visible:border-primary"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  required
                  autoFocus
                />
                <Button 
                  type="button"
                  variant="ghost"
                  className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors" 
                  onClick={() => setTwoFactorStep(false)}
                >
                  ← Use another method
                </Button>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2 text-center animate-in zoom-in-95">
                {error}
              </p>
            )}

            <Button 
              type="submit" 
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] font-bold text-base" 
              disabled={isLoading || isSocialLoading !== null}
            >
              {isLoading && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              {twoFactorStep ? "Verify & Login" : "Login"}
            </Button>
            
            {!twoFactorStep && (
              <>
                <div className="relative flex items-center gap-4 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold bg-background px-2">
                    Or login with
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="h-11 bg-background/50 border-primary/20 hover:bg-white/5 hover:border-gray-400/40 transition-all"
                    type="button"
                    disabled={isLoading || isSocialLoading !== null}
                    onClick={() => handleSocialLogin("google")}
                  >
                    {isSocialLoading === "google" ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="mr-2 h-4 w-4">
                        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                      </svg>
                    )}
                    Google
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 bg-background/50 border-primary/20 hover:bg-black/5 hover:border-black/40 transition-all dark:hover:bg-white/5 dark:hover:border-white/40"
                    type="button"
                    disabled={isLoading || isSocialLoading !== null}
                    onClick={() => handleSocialLogin("apple")}
                  >
                    {isSocialLoading === "apple" ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className="mr-2 h-4 w-4">
                        <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                      </svg>
                    )}
                    Apple
                  </Button>
                </div>
              </>
            )}

            <div className="text-center text-sm">
              Don't have an account?{" "}
              <Link to="/register" className="font-bold text-primary hover:underline underline-offset-4">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </form>
      <div className="text-balance text-center text-[10px] text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary transition-colors">
        By clicking login, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}
