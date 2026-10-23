import { type Metadata } from "next";
import { Suspense } from "react";

import { LoginCard } from "./login-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main id="main" className="bg-muted/40 flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
