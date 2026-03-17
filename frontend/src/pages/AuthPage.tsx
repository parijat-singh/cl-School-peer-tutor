// src/pages/AuthPage.tsx
import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { Button, Input, Select } from "@/components/shared/ui";
import { BookOpen, AlertCircle, CheckCircle, Mail } from "lucide-react";
import type { GradeLevel, UserRole } from "@/lib/types";

// ── Schemas ──────────────────────────────────────────────────────

const signInSchema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password required"),
});

const signUpSchema = z.object({
  name:            z.string().min(2, "Name must be at least 2 characters"),
  email:           z.string().email("Enter a valid email"),
  password:        z.string().min(8, "Password must be at least 8 characters")
                     .regex(/[A-Z]/, "Must contain an uppercase letter")
                     .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
  grade:           z.string().optional() as z.ZodType<GradeLevel | undefined>,
  role:            z.enum(["tutor", "tutee", "both", "teacher"]) as z.ZodType<Exclude<UserRole, "schooladmin" | "superadmin">>,
}).refine((data) => data.role === "teacher" || (data.grade && data.grade.length > 0), {
  message: "Select your grade",
  path: ["grade"],
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const resetSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

type SignInForm = z.infer<typeof signInSchema>;
type SignUpForm = z.infer<typeof signUpSchema>;
type ResetForm  = z.infer<typeof resetSchema>;

const GRADES: { value: GradeLevel; label: string }[] = [
  { value: "6th",  label: "6th Grade"  },
  { value: "7th",  label: "7th Grade"  },
  { value: "8th",  label: "8th Grade"  },
  { value: "9th",  label: "9th Grade"  },
  { value: "10th", label: "10th Grade" },
  { value: "11th", label: "11th Grade" },
  { value: "12th", label: "12th Grade" },
];

// ── OTP Input ────────────────────────────────────────────────────

function OtpInput({ onComplete }: { onComplete: (otp: string) => void }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null)); // eslint-disable-line react-hooks/rules-of-hooks

  useEffect(() => { refs[0].current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next  = [...digits];
    next[i]     = digit;
    setDigits(next);
    if (digit && i < 5) refs[i + 1].current?.focus();
    if (next.every((d) => d)) onComplete(next.join(""));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next   = [...digits];
    pasted.split("").forEach((d, idx) => { next[idx] = d; });
    setDigits(next);
    refs[Math.min(pasted.length, 5)].current?.focus();
    if (pasted.length === 6) onComplete(pasted);
  };

  return (
    <div className="flex gap-3 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-lg outline-none transition-colors
            border-gray-300 focus:border-brand-500 bg-white text-gray-900"
        />
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────

export default function AuthPage() {
  const [params] = useSearchParams();
  const initMode = params.get("mode") === "signup" ? "signup"
    : params.get("mode") === "reset" ? "reset"
    : "signin";
  const [mode, setMode] = useState<"signin" | "signup" | "verify" | "reset">(initMode);
  const [serverError, setServerError]     = useState("");
  const [verifyEmail, setVerifyEmail]     = useState("");
  const [resetSent, setResetSent]         = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { signIn, signUp, resetPassword, sendVerificationOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const signInForm = useForm<SignInForm>({ resolver: zodResolver(signInSchema) });
  const signUpForm = useForm<SignUpForm>({ resolver: zodResolver(signUpSchema) });
  const resetForm  = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSignIn = signInForm.handleSubmit(async (data) => {
    setServerError("");
    try {
      await signIn(data.email, data.password);
      navigate("/dashboard");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      setServerError(
        code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential"
          ? "Incorrect email or password."
          : "Sign in failed. Please try again."
      );
    }
  });

  const handleSignUp = signUpForm.handleSubmit(async (data) => {
    setServerError("");
    try {
      await signUp({
        email:    data.email,
        password: data.password,
        name:     data.name,
        grade:    data.role === "teacher" ? null : (data.grade as GradeLevel),
        role:     data.role as UserRole,
      });
      await sendVerificationOtp();
      setVerifyEmail(data.email);
      setResendCooldown(60);
      setMode("verify");
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "";
      setServerError(
        msg.includes("email-already-in-use")
          ? "An account with this email already exists."
          : msg.includes("school") || msg.includes("pending")
          ? msg
          : "Sign up failed. Please try again."
      );
    }
  });

  const handleVerifyOtp = async (otp: string) => {
    setServerError("");
    setVerifyLoading(true);
    try {
      await verifyOtp(otp);
      navigate("/dashboard");
    } catch (err: unknown) {
      setServerError((err as { message?: string }).message ?? "Verification failed.");
      setVerifyLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setServerError("");
    setResendLoading(true);
    try {
      await sendVerificationOtp();
      setResendCooldown(60);
    } catch (err: unknown) {
      setServerError((err as { message?: string }).message ?? "Failed to resend code.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleResetPassword = resetForm.handleSubmit(async (data) => {
    setServerError("");
    try {
      await resetPassword(data.email);
      setResetSent(true);
    } catch {
      setServerError("Couldn't send reset email. Check the address and try again.");
    }
  });

  // ── Brand panel ─────────────────────────────────────────────────
  const brandPanel = (
    <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 bg-navy-DEFAULT p-10">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded bg-brand-500 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <span className="font-display text-xl text-white">PeerTutor</span>
      </div>
      <div>
        <h2 className="font-display text-4xl text-white leading-tight mb-4">
          Learn from<br />the student<br />next to you.
        </h2>
        <p className="text-blue-200 text-sm leading-relaxed">
          School-verified peer tutoring. Book a session in under 3 minutes.
          Every tutor from your own school, every session tracked.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { n: "10K+", l: "Students" },
          { n: "99.9%", l: "Uptime" },
          { n: "4.8★", l: "Avg Rating" },
          { n: "< 30s", l: "Booking" },
        ].map((s) => (
          <div key={s.l} className="bg-navy-light rounded p-3">
            <div className="font-display text-2xl text-white">{s.n}</div>
            <div className="text-xs text-blue-200">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-56px)] flex">
      {brandPanel}

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">

          {/* ── Verify OTP ── */}
          {mode === "verify" && (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <div className="w-14 h-14 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-brand-600" />
                </div>
                <h1 className="font-display text-2xl text-gray-900 mb-2">Check your email</h1>
                <p className="text-sm text-gray-500">
                  We sent a 6-digit code to{" "}
                  <strong className="text-gray-700">{verifyEmail}</strong>.
                  Enter it below to activate your account.
                </p>
              </div>

              {serverError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {serverError}
                </div>
              )}

              <OtpInput onComplete={handleVerifyOtp} />

              {verifyLoading && (
                <p className="text-center text-sm text-gray-500">Verifying…</p>
              )}

              <div className="text-center text-sm text-gray-500">
                Didn't receive it?{" "}
                {resendCooldown > 0 ? (
                  <span className="text-gray-400">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    onClick={handleResendOtp}
                    disabled={resendLoading}
                    className="text-brand-600 hover:underline disabled:opacity-50"
                  >
                    {resendLoading ? "Sending…" : "Resend code"}
                  </button>
                )}
              </div>

              <button
                onClick={() => { setMode("signin"); setServerError(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 text-center hover:underline"
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot Password ── */}
          {mode === "reset" && (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="font-display text-2xl text-gray-900 mb-1">Reset your password</h1>
                <p className="text-sm text-gray-500">
                  Enter your school email and we'll send you a secure reset link.
                </p>
              </div>

              {resetSent ? (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-900 mb-1">Reset link sent</p>
                    <p className="text-sm text-gray-500">
                      Check your inbox. The link expires in 1 hour.
                    </p>
                  </div>
                  <button
                    onClick={() => { setMode("signin"); setResetSent(false); resetForm.reset(); }}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="flex flex-col gap-4" noValidate>
                  {serverError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {serverError}
                    </div>
                  )}
                  <Input
                    label="School Email"
                    type="email"
                    placeholder="you@yourschool.com"
                    error={resetForm.formState.errors.email?.message}
                    {...resetForm.register("email")}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    loading={resetForm.formState.isSubmitting}
                  >
                    Send reset link
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); setServerError(""); }}
                    className="text-sm text-gray-400 hover:text-gray-600 text-center hover:underline"
                  >
                    Back to sign in
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── Sign In / Sign Up ── */}
          {(mode === "signin" || mode === "signup") && (
            <>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-8">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setServerError(""); }}
                    className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                      mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              {serverError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3 mb-5 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {serverError}
                </div>
              )}

              {mode === "signin" && (
                <form onSubmit={handleSignIn} className="flex flex-col gap-4" noValidate>
                  <div>
                    <h1 className="font-display text-2xl text-gray-900 mb-1">Welcome back</h1>
                    <p className="text-sm text-gray-500">Sign in with your school email</p>
                  </div>
                  <Input
                    label="School Email"
                    type="email"
                    placeholder="you@yourschool.com"
                    error={signInForm.formState.errors.email?.message}
                    {...signInForm.register("email")}
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    error={signInForm.formState.errors.password?.message}
                    {...signInForm.register("password")}
                  />
                  <div className="flex justify-end">
                    <Link
                      to="/auth?mode=reset"
                      onClick={() => { setMode("reset"); setServerError(""); }}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full mt-1"
                    loading={signInForm.formState.isSubmitting}
                  >
                    Sign in
                  </Button>
                </form>
              )}

              {mode === "signup" && (
                <form onSubmit={handleSignUp} className="flex flex-col gap-4" noValidate>
                  <div>
                    <h1 className="font-display text-2xl text-gray-900 mb-1">Join PeerTutor</h1>
                    <p className="text-sm text-gray-500">Use your school email to get started</p>
                  </div>
                  <Input
                    label="Full Name"
                    type="text"
                    placeholder="Jordan Smith"
                    error={signUpForm.formState.errors.name?.message}
                    {...signUpForm.register("name")}
                  />
                  <Input
                    label="School Email"
                    type="email"
                    placeholder="you@yourschool.com"
                    hint="Use the email address associated with your school"
                    error={signUpForm.formState.errors.email?.message}
                    {...signUpForm.register("email")}
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    hint="Min 8 chars, one uppercase, one number"
                    error={signUpForm.formState.errors.password?.message}
                    {...signUpForm.register("password")}
                  />
                  <Input
                    label="Confirm Password"
                    type="password"
                    placeholder="••••••••"
                    error={signUpForm.formState.errors.confirmPassword?.message}
                    {...signUpForm.register("confirmPassword")}
                  />
                  <Select
                    label="I am a"
                    options={[
                      { value: "tutee",   label: "Student - Find a tutor" },
                      { value: "tutor",   label: "Student - Be a tutor" },
                      { value: "both",    label: "Student - Both" },
                      { value: "teacher", label: "Teacher" },
                    ]}
                    error={signUpForm.formState.errors.role?.message}
                    {...signUpForm.register("role")}
                  />
                  {signUpForm.watch("role") !== "teacher" && (
                    <Select
                      label="Grade"
                      placeholder="Select grade"
                      options={GRADES}
                      error={signUpForm.formState.errors.grade?.message}
                      {...signUpForm.register("grade")}
                    />
                  )}
                  <p className="text-xs text-gray-400">
                    By creating an account you agree to our{" "}
                    <a href="/terms" className="text-brand-600 hover:underline">Terms of Service</a>
                    {" "}and{" "}
                    <a href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</a>.
                  </p>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full mt-1"
                    loading={signUpForm.formState.isSubmitting}
                  >
                    Create account
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
