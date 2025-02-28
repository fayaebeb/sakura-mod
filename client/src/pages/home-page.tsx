import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import ChatInterface from "@/components/chat-interface";
import { useEffect, useState } from "react";


const NetworkStatus = ({ isOnline }: { isOnline: boolean }) => {
  return (
    <div className="absolute top-[5.3rem] right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-background/80 backdrop-blur-md border shadow-lg z-50">
      {isOnline ? (
        <>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">🌸 オンライン</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-muted-foreground">😴 オフライン</span>
        </>
      )}
    </div>
  );
};


export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  // Extract username before '@' from email
  const displayName = user?.username?.split("@")[0];

  // Manage Network Status
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#7D2E3A]">
      {/* ヘッダーセクション */}
      <header className="border-b bg-[#f8eee2] shadow-sm">
  <div className="container mx-auto px-4 py-2 flex justify-between items-center">
    {/* Company Logo (Smaller on Mobile) */}
    <div className="flex items-center">
      <img src="/images/pclogo.png" alt="Company Logo" className="h-5 sm:h-10" />
    </div>

    {/* AI Brand Logo (Same for All Screens) */}
    <div className="flex items-center">
      <img src="/images/skmod.png" alt="桜AI ロゴ" className="h-16 sm:h-24 w-auto" />
    </div>

    {/* User Info & Logout (Username Hidden on Mobile) */}
      {/* Moderator Info & Logout */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-sm font-bold text-[#b35800] bg-[#f3e1ce] px-3 py-1 rounded-lg">
          {displayName} (モデレーター)
        </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        ログアウト
      </Button>
    </div>
  </div>
</header>
      {/* 🔹 Floating Network Status Indicator */}
      <NetworkStatus isOnline={isOnline} />

      {/* チャットインターフェースセクション */}
      <main className="flex-1 container mx-auto px-4 py-8">
          <div className="bg-[#f5e1cb] rounded-lg shadow-md p-4 max-w-3xl mx-auto">

          <ChatInterface />
        </div>
      </main>
    </div>
  );
}
