"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { persistSession } from "@/lib/session";

/**
 * The post-login target. Read straight from the current URL at submit time
 * (not via useSearchParams) so this page needs no Suspense boundary and
 * server-renders in full - a Suspense fallback here meant the whole login
 * screen painted blank until the client bundle hydrated ("late reload").
 * Only ever follow a same-origin app path, never an absolute/external value.
 */
function postLoginTarget(): string {
  if (typeof window === "undefined") return "/dashboard";
  const from = new URLSearchParams(window.location.search).get("from");
  // Reject protocol-relative ("//host") and backslash forms ("/\host", which
  // browsers normalise to "//host") - both would navigate off-site.
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return "/dashboard";
  }
  return from;
}

/**
 * Pixel reference: docs/project-plan.html (login the reference). Split hero
 * layout, ICAR mark + zone seal, username/password with reveal toggle.
 */
function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Stays true from a successful response until the dashboard nav actually
  // takes over, so the button never flips back to its idle label while the
  // page still sits on /login waiting for the route change.
  const [redirecting, setRedirecting] = useState(false);

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 lg:block">
        <Image
          src="/brand/hero-farmland.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/35 to-transparent" />
        <div className="absolute bottom-14 left-12 right-12 text-white">
          <p className="text-sm font-semibold tracking-wider uppercase">
            AMS - ATARI Zone (IV) Patna
          </p>
          <h1 className="mt-3 text-4xl leading-[1.15] font-bold text-shadow-lg">
            ICAR - Agricultural Technology Application Research Institute
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/90">
            ATARI is mandated for Coordination and Monitoring of Technology
            Application and Frontline Extension Education Programmes.
            <br />
            Strengthening Agricultural Extension Research and Knowledge
            Management.
          </p>
        </div>
      </div>

      {/* Exact background sampled from the reference login screen (#f1eee4) -
 distinct from the app's regular off-white content background. */}
      <div className="flex w-full flex-col items-center justify-center bg-[#f1eee4] px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <Image
              src="/brand/icar-logo.png"
              alt="ICAR"
              width={225}
              height={300}
              className="h-20 w-auto"
            />
            <Image
              src="/brand/zone-seal-patna.png"
              alt="ATARI Zone IV Patna"
              width={300}
              height={300}
              className="h-20 w-20 rounded-full"
            />
          </div>

          <h2 className="text-4xl font-bold text-[#034541]">Welcome Back!</h2>

          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setSubmitting(true);
              try {
                const response = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ username, password, remember }),
                });
                const data = await response.json();
                if (!response.ok) {
                  setError(data.error ?? "Something went wrong. Please try again.");
                  setSubmitting(false);
                  return;
                }
                persistSession({ role: data.role, kvkName: data.kvkName, hostOrgName: data.hostOrgName });
                // Keep the button in its loading state through the navigation -
                // don't drop back to "Continue" while /login is still on screen.
                setRedirecting(true);
                router.replace(postLoginTarget());
              } catch {
                setError("Could not reach the server. Please try again.");
                setSubmitting(false);
              }
            }}
          >
            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-semibold text-[#034541]"
              >
                Username
              </label>
              <Input
                id="username"
                placeholder="Enter Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="h-13 rounded-lg border-black/15 bg-transparent px-4 text-base placeholder:text-muted-foreground/80"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-semibold text-[#034541]"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="h-13 rounded-lg border-black/15 bg-transparent px-4 pr-11 text-base placeholder:text-muted-foreground/80"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4.5" />
                  ) : (
                    <Eye className="size-4.5" />
                  )}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#034541] select-none">
              <Checkbox
                checked={remember}
                onCheckedChange={(value) => setRemember(value === true)}
                /* Login page sits on a pale cream background - the default light
                   border is nearly invisible there, so force the brand dark
                   green outline and fill. */
                className="size-4.5 border-2 border-[#034541] data-checked:border-[#034541] data-checked:bg-[#034541] data-checked:text-white"
              />
              Remember me on this device
            </label>

            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting || redirecting}
              className="h-13 w-full rounded-lg bg-[#034541] text-base font-semibold text-white hover:bg-[#034541]/90 disabled:opacity-70"
            >
              {submitting || redirecting ? "Signing in…" : "Continue"}
            </Button>
          </form>

          <div className="mt-6 space-y-1 text-center text-sm">
            <a
              href="/AMS_User_Manual.pdf"
              target="_blank"
              rel="noopener noreferrer"
              download
              className="block text-[#034541] underline underline-offset-2"
            >
              Download User Manual
            </a>
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLScEHp9RiLffqgAZwKKGh63faAzR9wbRooasr1UcQDf77xdpKw/viewform?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="block font-semibold text-destructive underline underline-offset-2"
            >
              Feedback / Help &amp; Support: Google Form
            </a>
            <p className="text-muted-foreground">
              Or reach out to us at{" "}
              <a
                href="mailto:atariams.kvk@gmail.com"
                className="text-[#034541]"
              >
                atariams.kvk@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}
