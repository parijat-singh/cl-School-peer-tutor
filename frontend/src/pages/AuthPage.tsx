// src/pages/AuthPage.tsx
import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth, validateSchoolEmail } from "@/lib/auth-context";
import { Button, Input, Select } from "@/components/shared/ui";
import { BookOpen, AlertCircle } from "lucide-react";
import type { GradeLevel, UserRole } from "@/lib/types";

// ── Schemas ──────────────────────────────────────────────────────

const signInSchema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password required"),
});

const signUpSchema = z.object({
  name:     z.string().min(2, "Name must be at least 2 characters"),
  email:    z.string().email("Enter a valid email")
              .refine(validateSchoolEmail, "Must be a school email (.edu or .k12)"),
  password: z.string().min(8, "Password must be at least 8 characters")
              .regex(/[A-Z]/, "Must contain an uppercase letter")
              .regex(/[0-9]/, "Must contain a number"),
  grade:    z.string().min(1, "Select your grade") as z.ZodType<GradeLevel>,
  role:     z.enum(["tutor", "tutee", "both"]) as z.ZodType<Exclude<UserRole, "admin">>,
  parentEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
});

type SignInForm = z.infer<typeof signInSchema>;
type SignUpForm = z.infer<typeof signUpSchema>;

const GRADES: { value: GradeLevel; label: string }[] = [
  { value: "6th",  label: "6th Grade"  },
  { value: "7th",  label: "7th Grade"  },
  { value: "8th",  label: "8th Grade"  },
  { value: "9th",  label: "9th Grade"  },
  { value: "10th", label: "10th Grade" },
  { value: "11th", label: "11th Grade" },
  { value: "12th", label: "12th Grade" },
];

// ── Component ────────────────────────────────────────────────────

export default function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin"
  );
  const [serverError, setServerError] = useState("");
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Sign-in form
  const signInForm = useForm<SignInForm>({ resolver: zodResolver(signInSchema) });
  const signUpForm = useForm<SignUpForm>({ resolver: zodResolver(signUpSchema) });

  const watchedGrade = signUpForm.watch("grade");
  const needsParentEmail = watchedGrade === "6th" || watchedGrade === "7th";

  const handleSignIn = signInForm.handleSubmit(async (data) => {
    setServerError("");
    try {
      await signIn(data.email, data.password);
      navigate("/dashboard");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      setServerError(
        code === "auth/user-not-found" || code === "auth/wrong-password"
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
        grade:    data.grade as GradeLevel,
        role:     data.role as UserRole,
      });
      navigate("/dashboard");
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "";
      setServerError(
        msg.includes("email-already-in-use")
          ? "An account with this email already exists."
          : msg.includes("school email")
          ? msg
          : "Sign up failed. Please try again."
      );
    }
  });

  return (
    <div className="min-h-[calc(100vh-56px)] flex">
      {/* Left brand panel */}
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

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          {/* Tab toggle */}
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

          {/* Error banner */}
          {serverError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3 mb-5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          {/* ── Sign In ── */}
          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="flex flex-col gap-4" noValidate>
              <div>
                <h1 className="font-display text-2xl text-gray-900 mb-1">Welcome back</h1>
                <p className="text-sm text-gray-500">Sign in with your school email</p>
              </div>
              <Input
                label="School Email"
                type="email"
                placeholder="you@school.edu"
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
                <Link to="/auth?mode=reset" className="text-xs text-brand-600 hover:underline">
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

          {/* ── Sign Up ── */}
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
                placeholder="you@school.edu"
                hint="Must be a .edu or .k12 address"
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

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Grade"
                  placeholder="Select grade"
                  options={GRADES}
                  error={signUpForm.formState.errors.grade?.message}
                  {...signUpForm.register("grade")}
                />
                <Select
                  label="I want to"
                  options={[
                    { value: "tutee", label: "Find a tutor" },
                    { value: "tutor", label: "Be a tutor" },
                    { value: "both",  label: "Both" },
                  ]}
                  error={signUpForm.formState.errors.role?.message}
                  {...signUpForm.register("role")}
                />
              </div>

              {/* COPPA consent notice */}
              {needsParentEmail && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                  <strong>Parental consent required.</strong> Because you are in 6th or 7th grade,
                  we will email a consent request to your parent or guardian before activating your account.
                  <div className="mt-2">
                    <Input
                      label="Parent / Guardian Email"
                      type="email"
                      placeholder="parent@example.com"
                      error={signUpForm.formState.errors.parentEmail?.message}
                      {...signUpForm.register("parentEmail")}
                    />
                  </div>
                </div>
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
        </div>
      </div>
    </div>
  );
}
