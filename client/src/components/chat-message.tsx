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
}

export default function ChatMessage({ message }: { message: MessageWithBot }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMessage = useMutation({
    mutationFn: async (messageId: number) => {
      return apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      const sessionIdFromURL = window.location.pathname.split('/').pop() || '';
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
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
        <Avatar className={cn({ "order-2": !message.isBot })}>
          {message.isBot ? (
            <img 
              src="/images/sava.jpg" 
              alt="Sakura AI" 
              className="w-full h-full object-cover rounded-full border border-pink-400 shadow-md"
            />
          ) : (
            <div
              className={cn("w-full h-full flex items-center justify-center text-xs font-semibold rounded-full", {
                "bg-primary text-primary-foreground": message.isBot,
                "bg-pink-300 text-white": !message.isBot,
              })}
            >
              モッド
            </div>
          )}
        </Avatar>

        <Card
          className={cn("px-4 py-3 max-w-[80%] rounded-lg relative", {
            "bg-[#FFB7C5] text-black border border-[#FF98A5] shadow-md": !message.isBot,
            "bg-gray-100 text-black": message.isBot,
          })}
        >
          <div className="prose break-words">
            {message.isBot ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            ) : (
              <div className="whitespace-pre-wrap">{message.content}</div>
            )}
          </div>

          {message.isBot && (
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                      >
                        <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
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
          )}
        </Card>
      </div>
    </TooltipProvider>
  );
}