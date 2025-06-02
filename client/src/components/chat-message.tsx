import { Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Card } from "./ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
import React from "react";

interface MessageWithBot extends Omit<Message, 'isBot'> {
  isBot: boolean;
  username?: string; // username is optional (only on user messages)
}

function getDbidTag(dbid?: string): { label: string; className: string } {
  switch (dbid) {
    case "files":
      return { label: "うごき統計", className: "bg-pink-200 text-pink-800" };
    case "ktdb":
      return { label: "来た来ぬ統計", className: "bg-blue-200 text-blue-800" };
    case "ibt":
      return { label: "インバウンド統計", className: "bg-green-200 text-green-800" };
    default:
      return { label: dbid || "不明", className: "bg-gray-300 text-gray-700" };
  }
}

export default function ChatMessage({ message }: { message: MessageWithBot }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMessage = useMutation({
    mutationFn: async (messageId: number) => {
      return apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      // Extract the session ID from the current URL or component props
      const sessionIdFromURL = window.location.pathname.split('/').pop() || '';
      // Invalidate all queries related to messages for proper cache updates
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      // Also invalidate specific session query if available
      if (sessionIdFromURL) {
        queryClient.invalidateQueries({ queryKey: ["/api/messages", sessionIdFromURL] });
      }

      toast({
        title: "メッセージを削除しました",
        description: "メッセージが正常に削除されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "メッセージの削除に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  return (
    <TooltipProvider>
      <div
        className={cn("flex gap-3 relative group", {
          "justify-end": !message.isBot,
        })}
      >
        {message.isBot && (
          <Avatar>
            <img
              src="/images/sakura-dp.png"
              alt="sakura AI"
              className="w-full h-full object-cover rounded-full border border-pink-400 shadow-md"
            />
          </Avatar>
        )}

            <Card
              className={cn("px-4 py-3 max-w-[80%] rounded-lg relative flex flex-col gap-2", {
                "bg-[#FFB7C5] text-black border border-[#FF98A5] shadow-md": !message.isBot,
                "bg-gray-100 text-black": message.isBot,
              })}
            >
              <div className="break-words text-black">
                {message.isBot ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
              </div>

              <div className="flex justify-end gap-1 mt-2">
                {message.username && !message.isBot && (
                  <div className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full text-gray-600 font-medium shadow-sm">
                    {message.username.split('@')[0]}
                  </div>
                )}
                {message.dbid && (() => {
                  const tag = getDbidTag(message.dbid);
                  return (
                    <div
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-semibold shadow-sm",
                        tag.className
                      )}
                    >
                      {tag.label}
                    </div>
                  );
                })()}
              </div>

            <div
              className={cn(
                "absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity",
                {
                  "opacity-40 hover:opacity-100": message.isBot,
                }
              )}
            >
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      className={cn(
                        "h-8 w-8", 
                        { "animate-pulse hover:animate-none": message.isBot }
                      )}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>

              </Tooltip>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>メッセージを削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    本当にこのメッセージを削除しますか？この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMessage.mutate(message.id)}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    削除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  );
}