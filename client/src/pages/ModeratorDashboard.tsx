import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Message } from "@shared/schema";
import { ArrowLeft, UserIcon } from "lucide-react";
import { useLocation } from "wouter";
import ChatMsg from "@/components/chat-msg";

export default function ModeratorDashboard() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

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
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return "Invalid date";
    }
  };

  const filteredSessions = sessionIds?.filter((id: string) =>
    id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100">
      
    <div className="container mx-auto py-6">
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 px-3 py-2 text-sm md:text-base"
        >
          <ArrowLeft className="h-4 w-4" />
          
        </Button>

      </div>

      <h1 className="text-3xl font-bold mb-6">モデレーターダッシュボード</h1>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* User List */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>ユーザー</CardTitle>
            <CardDescription>チャット履歴を表示するには、ユーザーを選択してください</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="text"
              placeholder="Search user..."
              className="mb-4 w-full rounded-md border px-3 py-2 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {isLoadingSessionIds ? (
              <div className="flex justify-center p-4">
                <p>ユーザーを読み込み中...</p>
              </div>
            ) : filteredSessions && filteredSessions.length > 0 ? (
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {filteredSessions.map((sessionId: string) => (
                    <Button
                      key={sessionId}
                      variant={selectedSessionId === sessionId ? "secondary" : "ghost"}
                      className={`w-full justify-start text-left ${
                        selectedSessionId === sessionId ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedSessionId(sessionId)}
                    >
                      {sessionId}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
      <p className="text-muted-foreground text-center p-4">ユーザーが見つかりませんでした</p>
            )}
          </CardContent>
        </Card>

        {/* Chat History */}
        <Card className="md:col-span-9">
          <CardHeader>
            <CardTitle className="text-xl font-semibold leading-tight">
              <div>チャット履歴：</div>
              <div className="mt-1 inline-flex items-center gap-2 bg-muted px-3 py-1 rounded-md text-primary text-2xl font-bold">
                <UserIcon className="w-5 h-5" />
                「{selectedSessionId}」
              </div>
            </CardTitle>




            {!selectedSessionId && (
              <CardDescription>
                チャット履歴を表示するには、ユーザーを選択してください
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!selectedSessionId ? (
              <div className="flex justify-center items-center h-[500px] border rounded-md border-dashed">
                <p className="text-muted-foreground">チャット履歴を表示するには、ユーザーを選択してください</p>
              </div>
            ) : isLoadingMessages ? (
              <div className="flex justify-center p-4">
                <p>Loading messages...</p>
              </div>
            ) : messages && messages.length > 0 ? (
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {messages.map((message: Message) => (
                    <ChatMsg key={message.id} message={message} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex justify-center items-center h-[500px] border rounded-md border-dashed">
                <p className="text-muted-foreground">No messages found for this user</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div></div>
  );
}