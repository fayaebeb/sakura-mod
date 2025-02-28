import { Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Card } from "./ui/card";

export default function ChatMessage({ message }: { message: Message }) {
  return (
    <div
      className={cn("flex gap-3", {
        "justify-end": !message.isBot,
      })}
    >
      <Avatar className={cn({ "order-2": !message.isBot })}>
        <div
          className={cn("w-full h-full flex items-center justify-center text-xs", {
            "bg-primary text-primary-foreground": message.isBot,
            "bg-muted": !message.isBot,
          })}
        >
          {message.isBot ? "桜" : "モッド"}
        </div>
      </Avatar>

      <Card
        className={cn("px-4 py-3 max-w-[80%]", {
          "bg-primary text-primary-foreground": !message.isBot,
        })}
      >
        {message.content}
      </Card>
    </div>
  );
}
