import Link from "next/link";

import { LoginForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-stage">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center px-4 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="rise-in max-w-xl space-y-5 text-white">
          <p className="font-display text-6xl font-semibold tracking-tight sm:text-7xl">Swiggato</p>
          <h1 className="max-w-md text-2xl font-medium leading-snug text-white/90 sm:text-3xl">
            See the real payable price before you order.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-white/70">
            Live Swiggy and Zomato quotes, side by side, from one natural-language search.
          </p>
        </div>

        <div className="rise-in-delay w-full max-w-md justify-self-start lg:justify-self-end">
          <div className="surface-panel rounded-lg p-7 shadow-panel">
            <div className="mb-6 space-y-1">
              <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h2>
              <p className="text-sm text-muted-foreground">Sign in to your private workspace.</p>
            </div>
            <LoginForm />
            <p className="mt-5 text-sm text-muted-foreground">
              New here?{" "}
              <Link className="font-semibold text-primary" href="/register">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
