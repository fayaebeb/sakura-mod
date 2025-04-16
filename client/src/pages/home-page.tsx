import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import ChatInterface from "@/components/chat-interface";
import { useEffect, useState } from "react";
import { FileText, ShieldAlert, LogOut, Wifi, WifiOff, Home, Settings, User } from "lucide-react";
import { useLocation } from "wouter"; // ✅ Correct router for your stack
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";

const NetworkStatus = ({ isOnline }: { isOnline: boolean }) => {
  return (
    <div className="absolute top-[5.3rem] right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/90 backdrop-blur-md border shadow-lg z-50 transition-all duration-300 hover:shadow-xl">
      {isOnline ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-600">🌸 オンライン</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-red-500" />
          <span className="text-xs font-medium text-red-600">😴 オフライン</span>
        </>
      )}
    </div>
  );
};

export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation(); // ✅ Use Wouter for navigation
  const isMobile = useIsMobile();

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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#7D2E3A] to-[#5D1E2A]">
      {/* ヘッダーセクション with Subtle Drop Shadow */}
      <header className="border-b bg-gradient-to-r from-[#f8eee2] to-[#f5e8d8] shadow-md sticky top-0 z-10">
        <div className="container mx-auto px-4 py-2 flex justify-between items-center">
          {/* Company Logo with Hover Effect */}
          <div className="flex items-center transition-transform duration-300 hover:scale-105">
            <img 
              src="/images/pclogo.png" 
              alt="Company Logo" 
              className="h-5 sm:h-10 drop-shadow-sm"
            />
          </div>

          {/* AI Brand Logo with Animation */}
          <div className="flex items-center transition-all duration-500 hover:drop-shadow-lg">
            <img 
              src="/images/skmod.png" 
              alt="桜AI ロゴ" 
              className="h-16 sm:h-24 w-auto"
            />
          </div>

          {/* User Controls with Improved Layout */}
          <div className="flex items-center gap-2">
            {/* User Badge - Enhanced for Mobile */}
            <Badge 
              variant="outline" 
              className="hidden sm:flex items-center gap-1.5 bg-[#f3e1ce] border-[#e8d6c0] text-[#b35800] px-3 py-1.5 font-medium shadow-sm"
            >
              <User className="h-3.5 w-3.5" />
              {displayName}
              <span className="text-xs opacity-75">(モデレーター)</span>
            </Badge>

            {/* Controls Container */}
            <div className="flex items-center gap-1.5">
              {/* Moderator Dashboard Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/moderator")}
                className="flex items-center gap-2 bg-white/80 hover:bg-white transition-colors"
                title="モデレーターダッシュボード"
              >
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                <span className="hidden sm:inline text-amber-800">モデレーター</span>
              </Button>

              {/* File History Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/files")}
                className="flex items-center gap-2 bg-white/80 hover:bg-white transition-colors"
                title="ファイル履歴"
              >
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="hidden sm:inline text-blue-800">ファイル履歴</span>
              </Button>

              {/* Logout Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                className="bg-white/90 hover:bg-white/100 hover:text-red-600 transition-colors"
              >
                {logoutMutation.isPending ? (
                  <span className="flex items-center gap-1.5">
                    <span className="animate-pulse">●</span>
                    処理中
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <LogOut className="h-3.5 w-3.5" />
                    <span>ログアウト</span>
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Floating Network Status */}
      <NetworkStatus isOnline={isOnline} />

      {/* Main Content with Improved Visuals */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="relative">
          {/* Decorative Elements */}
          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-32 h-12 bg-[#f8eee2] rounded-full blur-2xl opacity-20"></div>
          
          {/* Chat Interface Container with Enhanced Styling */}
          <div className="bg-gradient-to-br from-[#f7e6d0] to-[#f5e1cb] rounded-2xl shadow-lg overflow-hidden max-w-3xl mx-auto border border-[#e8d6c0]">
            {/* Optional Chat Title */}
            <div className="px-4 py-3 bg-[#f2d9be]/70 border-b border-[#e8d6c0] flex justify-between items-center">
              <h2 className="text-[#7D2E3A] font-medium flex items-center gap-2">
                <img src="/images/favicon.png" alt="Icon" className="w-5 h-5" />
                桜AI データ入力インターフェース。
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-white/50 text-xs font-normal">
                  {isOnline ? "接続済み" : "オフライン"}
                </Badge>
              </div>
            </div>
            
            {/* Chat Interface Component */}
            <div className={isMobile ? "p-3" : "p-5"}>
              <ChatInterface />
            </div>
          </div>
        </div>
      </main>
      
      {/* Simple Footer */}
      <footer className="py-4 px-6 bg-[#471a23] text-white/70 text-xs text-center">
        <div className="container mx-auto">
          <p>© 2025 桜AI - All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}