import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分享的對話 - Repo Agent Swarm",
  description: "查看分享的對話紀錄",
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
