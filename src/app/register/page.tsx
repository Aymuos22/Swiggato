import Link from "next/link";

import { RegisterForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="auth-stage">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center px-4 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="rise-in max-w-xl space-y-5 text-white">
          <p className="font-display text-6xl font-semibold tracking-tight sm:text-7xl">Swiggato</p>
          <h1 className="max-w-md text-2xl font-medium leading-snug text-white/90 sm:text-3xl">
            Your private dual-MCP food price desk.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-white/70">
            First account becomes admin. Connect platforms, save addresses, compare final prices.
          </p>
        </div>

        <div className="rise-in-delay w-full max-w-md justify-self-start lg:justify-self-end">
          <div className="surface-panel rounded-lg p-7 shadow-panel">
            <div className="mb-6 space-y-1">
              <h2 className="font-display text-2xl font-semibold tracking-tight">Create account</h2>
              <p className="text-sm text-muted-foreground">Set up your workspace in under a minute.</p>
            </div>
            <RegisterForm />
            <p className="mt-5 text-sm text-muted-foreground">
              Already registered?{" "}
              <Link className="font-semibold text-primary" href="/login">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
