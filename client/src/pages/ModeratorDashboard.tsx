import { useState, useEffect, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Message } from "@shared/moderatorSchema";
import { ArrowLeft, UserIcon, SearchIcon, MessageSquare, Users, Shield, Filter, Tag, ClipboardList, Menu, Home, SquareMinus } from "lucide-react";
import { useLocation } from "wouter";
import ChatMsg from "@/components/chat-msg";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Category options
const CATEGORIES = {
  ALL: "すべて",
  ADMINISTRATIVE: "行政",
  PRIVATE: "民間",
  SELF: "自分"
};

type CategoryType = keyof typeof CATEGORIES | "ALL";

export default function ModeratorDashboard() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const {
    data: allMessages,
    isLoading: isLoadingAllMessages,
    error: allMessagesError
  } = useQuery({
    queryKey: ["/api/moderator/messages"],
    queryFn: async () => {
      const res = await fetch("/api/moderator/messages");
      if (!res.ok) throw new Error("Failed to fetch all messages");
      return res.json();
    },
    enabled: !selectedSessionId,
    retry: 1
  });


  // Query to fetch all session IDs (usernames)
  const {
    data: sessionIds,
    isLoading: isLoadingSessionIds,
    error: sessionIdsError
  } = useQuery({
    queryKey: ["/api/moderator/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/moderator/sessions");
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    retry: 1
  });

  // Query to fetch messages for the selected session
  const {
    data: messages,
    isLoading: isLoadingMessages,
    error: messagesError
  } = useQuery({
    queryKey: ["/api/moderator/messages", selectedSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/moderator/messages/${selectedSessionId}`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedSessionId,
    retry: 1
  });

  useEffect(() => {
    if (allMessagesError) {
      toast({
        title: "Error fetching all messages",
        description:
          allMessagesError instanceof Error
            ? allMessagesError.message
            : "Unknown error",
        variant: "destructive"
      });
    }
  }, [allMessagesError, toast]);

  // Filter sessions by search term
  const activeMessages = selectedSessionId ? messages : allMessages;

  const filteredMessages = activeMessages?.filter((message: Message) => {
    if (selectedCategory === null) return false; // Show nothing
    if (selectedCategory === "ALL") return true;
    if (!message.category) return false;
    return message.category === selectedCategory;
  });

  useLayoutEffect(() => {
    if (!bottomRef.current) return;
    const timeout = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
    return () => clearTimeout(timeout);
  }, [filteredMessages?.length]);

  useEffect(() => {
    if (sessionIdsError) {
      toast({
        title: "Error fetching sessions",
        description:
          sessionIdsError instanceof Error
            ? sessionIdsError.message
            : "Unknown error",
        variant: "destructive"
      });
    }

    if (messagesError) {
      toast({
        title: "Error fetching messages",
        description:
          messagesError instanceof Error
            ? messagesError.message
            : "Unknown error",
        variant: "destructive"
      });
    }
  }, [sessionIdsError, messagesError, toast]);


  const formatTimestamp = (timestamp: string) => {
    const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffInSeconds = Math.floor((then - now) / 1000);

    const divisions = [
      { amount: 60, unit: 'seconds' },
      { amount: 60, unit: 'minutes' },
      { amount: 24, unit: 'hours' },
      { amount: 7, unit: 'days' },
      { amount: 4.34524, unit: 'weeks' },
      { amount: 12, unit: 'months' },
      { amount: Number.POSITIVE_INFINITY, unit: 'years' },
    ];

    let unitIndex = 0;
    let delta = diffInSeconds;

    for (const division of divisions) {
      if (Math.abs(delta) < division.amount) {
        return rtf.format(Math.round(delta), division.unit.slice(0, -1) as Intl.RelativeTimeFormatUnit);
      }
      delta /= division.amount;
      unitIndex++;
    }

    return rtf.format(Math.round(delta), 'year');
  };


  

  // Filter sessions by search term
  const filteredSessions = sessionIds?.filter((id: string) =>
    id.toLowerCase().includes(searchTerm.toLowerCase())
  );


  return (
        <div className="min-h-screen bg-gradient-to-br from-[#fff1f2] via-[#ffeae5] to-[#fff4e6]">
              <div className="container mx-auto px-4 py-6">
                {/* Enhanced Header Section with Navigation */}
                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 bg-gradient-to-r from-[#ffe9ec] via-[#ffe0d3] to-transparent p-4 rounded-xl shadow-sm">
                  {/* Back Button with Hover Effect */}
                  <Button
                    variant="ghost"
                    onClick={() => setLocation("/")}
                    className="hidden md:flex items-center gap-2 px-4 py-2 text-sm rounded-full bg-white/80 hover:bg-white hover:shadow-md transition-all duration-300 border border-[#f5cfd4]"
                  >
                    <ArrowLeft className="h-4 w-4 text-primary" />
                    <span className="font-medium">ホームに戻る</span>
                  </Button>

                  {/* Desktop: Enhanced Navigation Buttons */}
                  <div className="hidden md:flex items-center gap-3">
                    <Badge variant="outline" className="px-3 py-1.5 text-sm font-medium inline-flex items-center bg-[#fff4f5]/80 border border-[#f5cfd4]">
                      <Shield className="w-4 h-4 mr-1.5 text-primary" />
                      モデレーター専用
                    </Badge>

                    <Button
                      onClick={() => setLocation("/feedback")}
                      className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 shadow-lg transition-all duration-300 hover:opacity-90"
                    >
                      <ClipboardList className="h-5 w-5 text-white" />
                      <span>フィードバックを管理</span>
                    </Button>


                  </div>

                  {/* Mobile: Enhanced Dropdown Menu */}
                  {/* Mobile: Back Button + Dropdown Menu on same row */}
                  <div className="md:hidden flex justify-between items-center w-full px-2 absolute top-2 left-0 right-0">
                    {/* Mobile Back Button */}
                    <Button
                      variant="ghost"
                      onClick={() => setLocation("/")}
                      className="flex items-center gap-1 px-3 py-2 text-sm rounded-full bg-white/90 hover:bg-white border border-[#f5cfd4] hover:shadow-md transition-all duration-300"
                    >
                      <ArrowLeft className="h-4 w-4 text-primary" />
                      <span className="text-primary">戻る</span>
                    </Button>

                    {/* Mobile Dropdown Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full bg-white/90 hover:bg-white border border-[#f5cfd4] hover:shadow-md transition-all duration-300">
                          <Menu className="w-5 h-5 text-primary" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-lg border border-[#f5cfd4]">
                        <DropdownMenuLabel className="flex items-center gap-2 text-primary">
                          <Shield className="w-4 h-4" />
                          モデレーターメニュー
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 rounded-lg hover:bg-primary/10 cursor-pointer my-1 p-2"
                          onClick={() => setLocation("/")}
                        >
                          <Home className="w-4 h-4 text-primary" />
                          ホームに戻る
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 rounded-lg hover:bg-primary/10 cursor-pointer my-1 p-2"
                          onClick={() => setLocation("/feedback")}
                        >
                          <ClipboardList className="w-4 h-4 text-primary" />
                          フィードバックを管理
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                </div>

                {/* Enhanced Dashboard Title */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 w-full overflow-hidden">
                  <div className="flex items-center">
                    <div className="relative mr-4">
                      <div className="absolute -inset-1 bg-gradient-to-r from-[#f7bfc6] to-[#fddde6] rounded-full blur-sm opacity-70"></div>
                      <div className="relative bg-[#fff4f5] p-2 rounded-full shadow-md">
                        <Shield className="h-8 w-8 text-[#c55a6a]" />
                      </div>
                    </div>
                    <div>
                      <h1 className="text-[clamp(1.5rem,5vw,2rem)] font-bold text-[#b35a68] flex items-center gap-2 whitespace-nowrap">
                        モデレーターダッシュボード
                      </h1>
                      <p className="text-sm text-[#b56a78] mt-1 hidden md:block">
                        モデレーターコントロールパネル・メッセージの管理
                      </p>
                    </div>
                  </div>

                  <div className="flex mt-4 md:mt-0 items-center bg-white border border-[#f5cfd4] px-4 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex items-center mr-4">
                      <div className="p-1.5 bg-primary/10 rounded-full mr-2">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <span className="text-xs text-[#b56a78] block">ユーザー</span>
                        <span className="text-base font-semibold">{filteredSessions?.length || 0}</span>
                      </div>
                    </div>

                    <div className="h-10 w-[1px] bg-muted mx-2"></div>

                    <div className="flex items-center">
                      <div className="p-1.5 bg-primary/10 rounded-full mr-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <span className="text-xs text-[#b56a78] block">メッセージ</span>
                        <span className="text-base font-semibold">{messages?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* User List */}
          <Card className="md:col-span-4 border-0 shadow-md ">
            <CardHeader className="bg-[#ffe9ec]/30 border-b">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                ユーザー一覧
              </CardTitle>
              <CardDescription className="hidden sm:block">
                チャット履歴を表示するには、ユーザーを選択してください
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="relative mb-4">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#b56a78]" />
                <Input
                  type="text"
                  placeholder="ユーザーを検索..."
                  className="pl-9 w-full rounded-md border"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {isLoadingSessionIds ? (
                <div className="flex justify-center items-center p-8">
                  <div className="animate-pulse flex flex-col items-center">
                    <Users className="h-8 w-8 text-muted mb-2" />
                    <p className="text-[#b56a78]">ユーザーを読み込み中...</p>
                  </div>
                </div>
              ) : filteredSessions && filteredSessions.length > 0 ? (
                <ScrollArea className="h-[calc(100vh-300px)] pr-2">
                  <div className="space-y-2">
                    {filteredSessions.map((sessionId: string) => (
                      <Button
                        key={sessionId}
                        variant={selectedSessionId === sessionId ? "secondary" : "ghost"}
                        className={`w-full justify-start text-left rounded-lg transition-all ${
                          selectedSessionId === sessionId 
                            ? "bg-primary/10 border border-[#f5cfd4] shadow-sm" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() =>
                          setSelectedSessionId((prev) =>
                            prev === sessionId ? null : sessionId
                          )
                        }
                      >
                        <div className="flex items-center">
                          <UserIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{sessionId}</span>
                        </div>
                      </Button>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg">
                  <Users className="h-8 w-8 text-[#b56a78] mb-2" />
                  <p className="text-[#b56a78]">ユーザーが見つかりませんでした</p>
                </div>
              )}
            </CardContent>
            {filteredSessions && filteredSessions.length > 0 && (
              <CardFooter className="bg-[#ffe9ec]/30 border-t px-4 py-1">
                <p className="text-xs text-[#b56a78] w-full text-center">
                  {filteredSessions.length}人のユーザーが見つかりました
                </p>
              </CardFooter>
            )}
          </Card>

              <Card className="md:col-span-8 border-0 shadow-md flex flex-col h-[calc(100vh-100px)]">
              <CardHeader className="bg-[#ffe9ec]/30 border-b">
                <div className="flex flex-col gap-4 w-full">
                  {/* Top section: Title and User Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 w-full">
                    <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 shrink-0" />
                        <span className="text-lg font-semibold">チャット履歴</span>
                      </div>

                      {/* User Info and Clear Button */}
                      {selectedSessionId && (
                        <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
                          <Badge
                            variant="secondary"
                            className="px-3 py-1 text-sm h-auto flex items-center gap-1 bg-[#ffe9ec] text-[#c55a6a] border border-[#f5cfd4] shrink-0"
                          >
                            <UserIcon className="w-5 h-5 text-[#c55a6a]" />
                            <span>{selectedSessionId}</span>
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedSessionId(null)}
                            className="text-sm text-[#b56a78] hover:text-primary px-2 py-1"
                          >
                            <SquareMinus className="h-4 w-4 mr-1" />
                            ユーザー選択を解除
                          </Button>
                        </div>
                      )}
                    </CardTitle>
                  </div>

                  {/* Category Filters */}
                  <div className="overflow-x-auto">
                    <div className="flex items-center gap-2 min-w-max">
                      <div className="hidden sm:flex items-center shrink-0">
                        <Filter className="h-4 w-4 mr-1 text-[#b56a78]" />
                        <span className="text-xs text-[#b56a78]">カテゴリー:</span>
                      </div>
                      {(Object.keys(CATEGORIES) as CategoryType[]).map((cat) => (
                        <Badge
                          key={cat}
                          variant={
                            selectedCategory === cat
                              ? cat === "ALL"
                                ? "default"
                                : cat === "ADMINISTRATIVE"
                                ? "destructive"
                                : cat === "PRIVATE"
                                ? "secondary"
                                : "default"
                              : "outline"
                          }
                          className={`px-2 py-1 flex items-center cursor-pointer transition-all hover:shadow whitespace-nowrap ${
                            selectedCategory === cat
                              
                            ? cat === "ADMINISTRATIVE"
                                ? "bg-red-100 text-red-700 border-red-300"
                                : cat === "PRIVATE"
                                ? "bg-blue-100 text-blue-700 border-blue-300"
                                : cat === "SELF"
                                ? "bg-green-100 text-green-700 border-green-300"
                                : ""
                              : ""
                          }`}
                          onClick={() =>
                            setSelectedCategory((prev) =>
                              prev === cat ? null : cat
                            )
                          }
                        >
                          <Tag className="h-3 w-3 mr-1" />
                          {CATEGORIES[cat]}
                        </Badge>
                      ))}
                    </div>
                  </div>


                  {!selectedSessionId && (
                    <CardDescription className="hidden sm:block">
                      左側のユーザー一覧から選択して、チャット履歴を表示してください
                    </CardDescription>
                  )}
                </div>
              </CardHeader>


            <CardContent className="p-4 flex-1 overflow-hidden">
            {!selectedSessionId ? (
              filteredMessages && filteredMessages.length > 0 ? (
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-4">
                    {filteredMessages.map((message: Message) => (
                      <div key={message.id} className="group relative">
                        <ChatMsg message={message} />
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              ) : (
                  <div className="flex flex-col items-center justify-center h-full border rounded-lg border-dashed">
                    <MessageSquare className="h-12 w-12 text-[#c8828d]/50 mb-4" />
                    <p className="text-[#b56a78] mb-2">
                      {selectedCategory === null ? (
                        "メッセージは表示されていません"
                      ) : selectedCategory === "ALL" ? (
                        "チャット履歴を表示するには、ユーザーを選択してください"
                      ) : (
                        `カテゴリ「${CATEGORIES[selectedCategory]}」のメッセージが見つかりませんでした`
                      )}
                    </p>
                  {selectedCategory !== "ALL" && (
                    <Badge
                      variant="outline"
                      className="mt-2 cursor-pointer"
                      onClick={() => setSelectedCategory("ALL")}
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      すべてのメッセージを表示
                    </Badge>
                  )}
                </div>
              )
            ) : isLoadingMessages ? (
              <div className="flex justify-center items-center p-8 h-full">
                <div className="animate-pulse flex flex-col items-center">
                  <MessageSquare className="h-8 w-8 text-muted mb-2" />
                  <p className="text-[#b56a78]">メッセージを読み込み中...</p>
                </div>
              </div>
            ) : filteredMessages && filteredMessages.length > 0 ? (
              <ScrollArea className="h-full pr-2">
                <div className="space-y-4">
                  {filteredMessages.map((message: Message) => (
                    <div key={message.id} className="group relative">
                      <ChatMsg message={message} />
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            ) : messages && messages.length > 0 ? (
              <div className="flex flex-col items-center justify-center h-full border rounded-lg border-dashed">
                <Filter className="h-10 w-10 text-[#c8828d]/50 mb-3" />
                <p className="text-[#b56a78] mb-2">選択したカテゴリーのメッセージが見つかりませんでした</p>
                <Badge
                  variant="outline"
                  className="mt-2 cursor-pointer"
                  onClick={() => setSelectedCategory("ALL")}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  すべてのメッセージを表示
                </Badge>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full border rounded-lg border-dashed">
                <MessageSquare className="h-12 w-12 text-[#c8828d]/50 mb-4" />
                <p className="text-[#b56a78]">このユーザーのメッセージが見つかりませんでした</p>
              </div>
            )}

              {selectedSessionId && filteredMessages && filteredMessages.length > 0 && (
                <CardFooter className="bg-[#ffe9ec]/30 border-t px-4 py-2 text-[11px] sm:text-xs text-[#b56a78] min-h-[40px] overflow-x-auto">
                  <div className="flex items-center gap-4 min-w-max">
                    <span className="whitespace-nowrap">
                      最初のメッセージ: {formatTimestamp(filteredMessages[0].timestamp.toString())}
                    </span>
                    <span className="whitespace-nowrap">
                      最新のメッセージ: {formatTimestamp(filteredMessages[filteredMessages.length - 1].timestamp.toString())}
                    </span>
                    {selectedCategory && selectedCategory !== "ALL" && (
                      <Badge variant="outline" className="px-2 py-1 flex items-center whitespace-nowrap shrink-0">
                        <Tag className="h-3 w-3 mr-1" />
                        {CATEGORIES[selectedCategory]} フィルター適用中
                      </Badge>
                    )}
                  </div>
                </CardFooter>
              )}


          </CardContent>


          </Card>

        </div>
      </div>
    </div>
  );
}