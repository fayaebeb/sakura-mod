import { useState, useEffect } from "react";
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
import { Message } from "@shared/schema";
import { ArrowLeft, UserIcon, SearchIcon, MessageSquare, Users, Shield } from "lucide-react";
import { useLocation } from "wouter";
import ChatMsg from "@/components/chat-msg";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRef } from "react";

export default function ModeratorDashboard() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const bottomRef = useRef<HTMLDivElement | null>(null);


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
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);


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


  const filteredSessions = sessionIds?.filter((id: string) =>
    id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100">
      <div className="container mx-auto px-4 py-6">
        {/* Header Section with Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg shadow-sm hover:shadow transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>ホームに戻る</span>
          </Button>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">
              <Shield className="w-4 h-4 mr-1" />
              モデレーター専用
            </Badge>
          </div>
        </div>

        {/* Dashboard Title */}
        <div
          className="
            flex flex-col 
            md:flex-row md:items-center 
            justify-between mb-8 
            w-full 
            overflow-x-hidden
          "
        >
          <h1
            className="
              /* fluid font size: from 1.5rem up to 1.875rem (=text-3xl) */
              text-[clamp(1.5rem,5vw,1.875rem)] md:text-3xl 

              font-bold 
              flex items-center gap-2 

              /* on md+ keep title on one line */
              whitespace-nowrap 
              /* ensure it can shrink as needed in flex */
              flex-shrink 
            "
          >
            <Shield className="h-7 w-7 text-primary shrink-0" />
            モデレーターダッシュボード
          </h1>

          <div
            className="
              flex items-center 
              bg-muted/50 backdrop-blur-sm 
              px-4 py-2 rounded-lg shadow-sm 

              /* keep info block its natural size */
              shrink-0
            "
          >
            <Users className="h-5 w-5 mr-2 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {filteredSessions?.length || 0} ユーザー
            </span>
            <span className="mx-2 text-muted-foreground">•</span>
            <MessageSquare className="h-5 w-5 mr-2 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {messages?.length || 0} メッセージ
            </span>
          </div>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* User List */}
          <Card className="md:col-span-4 border-0 shadow-md">
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                ユーザー一覧
              </CardTitle>
              <CardDescription>チャット履歴を表示するには、ユーザーを選択してください</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="relative mb-4">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                    <p className="text-muted-foreground">ユーザーを読み込み中...</p>
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
                            ? "bg-primary/10 border border-primary/20 shadow-sm" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedSessionId(sessionId)}
                      >
                        <div className="flex items-center">
                          <UserIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{sessionId}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">ユーザーが見つかりませんでした</p>
                </div>
              )}
            </CardContent>
            {filteredSessions && filteredSessions.length > 0 && (
              <CardFooter className="bg-muted/30 border-t px-4 py-1">
                <p className="text-xs text-muted-foreground w-full text-center">
                  {filteredSessions.length}人のユーザーが見つかりました
                </p>
              </CardFooter>
            )}
          </Card>

          <Card className="md:col-span-8 border-0 shadow-md">
            <CardHeader className="bg-muted/30 border-b">
              {selectedSessionId ? (
      <CardTitle className="flex items-center gap-2 flex-nowrap overflow-x-auto">
        <MessageSquare className="h-5 w-5 shrink-0" />

        <span className="whitespace-nowrap shrink-0">チャット履歴:</span>

        <Badge
          variant="secondary"
          className="ml-2 px-3 py-1 text-base h-auto leading-tight flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-base">{selectedSessionId}</span>
        </Badge>


        {messages && (
          <Badge
            variant="outline"
            className="ml-auto px-2 py-0 text-xs whitespace-nowrap shrink-0"
          >
            {messages.length} メッセージ
          </Badge>
        )}
      </CardTitle>

              ) : (
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  チャット履歴
                </CardTitle>
              )}

              {!selectedSessionId && (
                <CardDescription>
                  左側のユーザー一覧から選択して、チャット履歴を表示してください
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="p-4 h-[calc(100vh-200px)]">
              {!selectedSessionId ? (
                <div className="flex flex-col items-center justify-center h-full border rounded-lg border-dashed">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground mb-2">チャット履歴を表示するには、ユーザーを選択してください</p>
                  <Badge variant="outline" className="mt-2">左側のユーザー一覧から選択</Badge>
                </div>
              ) : isLoadingMessages ? (
                <div className="flex justify-center items-center p-8 h-full">
                  <div className="animate-pulse flex flex-col items-center">
                    <MessageSquare className="h-8 w-8 text-muted mb-2" />
                    <p className="text-muted-foreground">メッセージを読み込み中...</p>
                  </div>
                </div>
              ) : messages && messages.length > 0 ? (
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-4">
                    {messages.map((message: Message) => (
                      <div key={message.id} className="group relative">
                        <ChatMsg message={message} />
                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-full border rounded-lg border-dashed">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">このユーザーのメッセージが見つかりませんでした</p>
                </div>
              )}
            </CardContent>
            {selectedSessionId && messages && messages.length > 0 && (
              <CardFooter className="bg-muted/30 border-t px-4 py-1 text-xs text-muted-foreground justify-between">
                <span>最初のメッセージ: {formatTimestamp(messages[0].timestamp.toString())}</span>
                <span>最新のメッセージ: {formatTimestamp(messages[messages.length - 1].timestamp.toString())}</span>
              </CardFooter>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}