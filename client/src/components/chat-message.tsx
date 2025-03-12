import { Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Card } from "./ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";

export default function ChatMessage({ message }: { message: Message }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMessage = useMutation({
    mutationFn: async (messageId: number) => {
      return apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Message deleted",
        description: "The message has been removed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete the message. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
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
              "bg-muted text-black": !message.isBot,
            })}
          >
            あなた
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {message.isBot && (
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Message</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this message? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMessage.mutate(message.id)}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </Card>
    </div>
  );
}