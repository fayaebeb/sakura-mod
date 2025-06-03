import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import ChatInterface from "@/components/chat-interface";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  FileText,
  ShieldAlert,
  LogOut,
  Wifi,
  User,
  Menu,
  WifiOff,
  Home,
  AlignJustify,
  Settings,
  UserPlus,
  SortAsc,
  Database,
  Search,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  const displayName = user?.username?.split("@")[0] || "";
  const { toast } = useToast();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const isMobile = useIsMobile();
  const [sortBy, setSortBy] = useState<"latest" | "oldest">("latest");
  const [dbFilter, setDbFilter] = useState<"files" | "ktdb" | "ibt" | "all">(
    "all",
  );
  const [usernameFilter, setUsernameFilter] = useState<string>("");
  const [messageSearch, setMessageSearch] = useState<string>("");

  const renderHeader = () => (
    <header className="sticky top-0 z-20 border-b border-[#f9dcd0] bg-gradient-to-r from-[#ffe0e9] via-[#ffd5c2] to-[#ffe4dc] shadow-sm">
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center min-w-[80px] justify-start">
          <motion.div whileHover={{ scale: 1.05 }}>
            <img
              src="/images/pclogo.png"
              alt="Company Logo"
              className="h-5 sm:h-10"
            />
          </motion.div>
        </div>

        {/* Center: Sakura Logo */}
        <div className="flex justify-center flex-1">
          <motion.img
            src="/images/sakura-mod-logo.png"
            alt="桜AI ロゴ"
            className="h-16 sm:h-24 w-auto"
            whileHover={{ scale: 1.05, rotate: [-1, 1, -1, 0] }}
            transition={{ rotate: { duration: 0.5 } }}
          />
        </div>

        {/* Right: Username + AlignJustify */}
        <div className="flex items-center min-w-[80px] justify-end gap-2">
          {/* Username Display */}
          <div className="border border-[#f7cfd4] bg-gradient-to-r from-[#ffe9ec] via-[#ffe0d3] to-[#fff0e6] text-[#a0525a] px-4 py-1 rounded-full text-sm font-medium flex items-center gap-2">
            <motion.span
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {displayName}
            </motion.span>

            {/* Badge - hidden on small screens */}
            <Badge className="hidden sm:inline bg-[#fce2e6] text-[#b85661] border border-[#f7cfd4] rounded-full px-2 py-0.5 text-xs">
              モデレーター
            </Badge>
          </div>

          {/* AlignJustify Menu - moved inside flex container */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="group text-[#c4626d] border border-[#f6cfd2] shadow-sm hover:shadow-md hover:bg-[#ffeef1] focus:ring-2 focus:ring-[#f7bfc6] transition-transform duration-200 ease-in-out will-change-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <AlignJustify className="h-5 w-5 text-[#b14c5c] group-hover:text-[#e35e71]" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-64 sm:w-72 border-[#f5c7cd] bg-gradient-to-br from-[#fff4f5]/95 via-[#ffe9ec]/95 to-[#fff0e6]/95 backdrop-blur-sm"
            >
              <DropdownMenuLabel className="text-[#b35a68] text-base font-semibold px-4 py-2">
                メニュー
              </DropdownMenuLabel>

              <DropdownMenuSeparator className="bg-[#fcdde3]" />

              <Link href="/admin">
                <DropdownMenuItem className="cursor-pointer text-[#a9546b] hover:bg-[#ffe7ed] focus:bg-[#ffe7ed] focus:text-[#bf3e55] px-4 py-3 text-base">
                  <UserPlus className="h-12 w-12 text-[#d76680]" />
                  招待管理
                </DropdownMenuItem>
              </Link>

              <Link href="/moderator">
                <DropdownMenuItem className="cursor-pointer text-[#a96452] hover:bg-[#ffebdb] focus:bg-[#ffebdb] focus:text-[#b85e47] px-4 py-3 text-base">
                  <ShieldAlert className="h-8 w-8 text-[#d27a5a]" />
                  モデレーター
                </DropdownMenuItem>
              </Link>

              <Link href="/files">
                <DropdownMenuItem className="cursor-pointer text-[#6f5eaa] hover:bg-[#f0e9ff] focus:bg-[#f0e9ff] focus:text-[#5c4d98] px-4 py-3 text-base">
                  <FileText className="h-8 w-8 text-[#937ccf]" />
                  ファイル履歴
                </DropdownMenuItem>
              </Link>

              <DropdownMenuSeparator className="bg-[#fcdde3]" />

              <DropdownMenuItem
                onClick={() => setShowLogoutConfirm(true)}
                disabled={logoutMutation.isPending}
                className="cursor-pointer text-[#b64848] hover:bg-red-500 focus:bg-red-500 focus:text-white transition-colors text-red-600 px-4 py-3 text-base"
              >
                <LogOut className="h-8 w-8 text-[#d75f5f]" />
                <motion.span
                  animate={{
                    scale: logoutMutation.isPending ? [1, 1.1, 1] : 1,
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: logoutMutation.isPending ? Infinity : 0,
                  }}
                >
                  ログアウト
                </motion.span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );

  const renderLogoutDialog = () => (
    <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
      <AlertDialogContent className="mx-auto max-w-[90%] sm:max-w-md md:max-w-lg lg:max-w-xl rounded-xl p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-pink-700 text-lg font-semibold">
            ログアウトしますか？
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600 mt-1">
            ログアウトすると、セッションが終了します。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-100">
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => logoutMutation.mutate()}
            className="bg-red-600 hover:bg-red-700 text-white border border-red-700"
          >
            ログアウト
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <>
      {renderHeader()}
      {renderLogoutDialog()}

      <main className="flex-1 container mx-auto px-4 py-6 sm:py-10 bg-gradient-to-br from-[#fff1f2] via-[#ffeae5] to-[#fff4e6]">
        <div className="relative">
          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-32 h-12 bg-[#fddde6] rounded-full blur-2xl opacity-30" />

          <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden max-w-3xl mx-auto border border-[#f5cfd4]">
            {/* Responsive Header Row */}
            <div className="px-4 py-4 sm:px-6 bg-[#ffe9ec]/90 border-b border-[#f5cfd4] overflow-x-auto">
              <div className="flex flex-nowrap items-center gap-3 sm:gap-6 min-w-max">
                {/* Title */}
                <h2 className="text-base sm:text-lg font-semibold text-[#b35a68] flex items-center gap-2 whitespace-nowrap shrink-0">
                  <img
                    src="/images/sakura-dp.png"
                    alt="Icon"
                    className="w-5 h-5"
                  />
                  データ入力パネル
                </h2>

                <div className="relative shrink-0">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="メッセージ検索"
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    className="w-[200px] pl-9 bg-white border border-[#f5cfd4] shadow-sm rounded-md text-sm py-2 px-3"
                  />
                </div>

                {/* Filter Dropdown */}
                <div className="relative shrink-0">
                  <Database className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Select
                    value={dbFilter}
                    onValueChange={(val) => setDbFilter(val as typeof dbFilter)}
                  >
                    <SelectTrigger className="w-[150px] pl-9 bg-white border border-[#f5cfd4] shadow-sm rounded-md text-sm">
                      <SelectValue placeholder="データベース" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">すべて</SelectItem>
                      <SelectItem value="files">うごき統計</SelectItem>
                      <SelectItem value="ktdb">来た来ぬ統計</SelectItem>
                      <SelectItem value="ibt">インバウンド統計</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort Dropdown */}
                <div className="relative shrink-0">
                  <SortAsc className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Select
                    value={sortBy}
                    onValueChange={(value) =>
                      setSortBy(value as "latest" | "oldest")
                    }
                  >
                    <SelectTrigger className="w-[130px] pl-9 bg-white border border-[#f5cfd4] shadow-sm rounded-md text-sm">
                      <SelectValue placeholder="並び替え" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">最新順</SelectItem>
                      <SelectItem value="oldest">古い順</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative shrink-0">
                  <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="ユーザー名"
                    value={usernameFilter}
                    onChange={(e) => setUsernameFilter(e.target.value)}
                    className="w-[180px] pl-9 bg-white border border-[#f5cfd4] shadow-sm rounded-md text-sm py-2 px-3"
                  />
                </div>
              </div>
            </div>

            {/* Chat Interface */}
            <div className={isMobile ? "p-3" : "p-6"}>
              <ChatInterface
                sortBy={sortBy}
                dbFilter={dbFilter}
                usernameFilter={usernameFilter}
                messageSearch={messageSearch}
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#f5cfd4] py-3 bg-[#fff4f5]/60 backdrop-blur-sm">
        <div className="container mx-auto px-4 text-center">
          <motion.p
            className="text-xs text-[#c55a6a]"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            桜AI - モデレーター版
          </motion.p>
        </div>
      </footer>
    </>
  );
}