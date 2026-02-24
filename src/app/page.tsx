"use client";

import { AppShell } from "@/components/layout";
import { Radar } from "lucide-react";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
          <Radar className="h-8 w-8 text-primary" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your Twitter intelligence overview will appear here.
        </p>
      </div>
    </AppShell>
  );
}
