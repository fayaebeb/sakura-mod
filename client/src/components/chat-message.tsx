import { Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Card } from "./ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // Import table support

export default function ChatMessage({ message }: { message: Message }) {
  return (
    <div
      className={cn("flex gap-3", {
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
        className={cn("px-4 py-3 max-w-[80%] rounded-lg", {
          "bg-[#FFB7C5] text-black border border-[#FF98A5] shadow-md": !message.isBot, // Soft pink for user messages
          "bg-gray-100 text-black": message.isBot, // Keep bot messages light
        })}
      >
        <div className="prose break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </Card>



    </div>
  );
}
