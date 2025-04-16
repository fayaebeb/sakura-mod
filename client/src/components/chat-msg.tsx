import { Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Card } from "./ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileText, Globe } from "lucide-react";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

const formatTimestamp = (timestamp: string) => {
  try {
    return formatDistanceToNow(new Date(timestamp), {
      addSuffix: true,
      locale: ja
    });
  } catch {
    return "日付エラー";
  }
};

// Helper function to parse message content into sections
const parseMessageContent = (content: string) => {
  const sections = {
    mainText: "",
    companyDocs: "",
    onlineInfo: ""
  };

  // Split by company docs marker
  const [beforeCompanyDocs, afterCompanyDocs = ""] = content.split("### 社内文書情報:");
  sections.mainText = beforeCompanyDocs.trim();

  // Split remaining content by online info marker
  const [companyDocs, onlineInfo = ""] = afterCompanyDocs.split("### オンラインWeb情報:");
  sections.companyDocs = companyDocs.trim();
  sections.onlineInfo = onlineInfo.trim();

  return sections;
};

const MessageSection = ({ 
  title, 
  content, 
  icon: Icon 
}: { 
  title: string; 
  content: string; 
  icon: React.ComponentType<any>; 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!content) return null;

  return (
    <Collapsible 
      open={isOpen} 
      onOpenChange={setIsOpen}
      className="mt-3 rounded-lg border border-pink-100 overflow-hidden transition-all duration-200"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-2 hover:bg-pink-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-pink-500" />
            <span className="text-sm font-medium text-pink-700">{title}</span>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-pink-500" />
          </motion.div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-3 bg-pink-50/50"
        >
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </motion.div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default function ChatMsg({ message }: { message: Message }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiPosition, setEmojiPosition] = useState({ x: 0, y: 0 });
  const [decoration, setDecoration] = useState<string | null>(null);

  

  const handleBotMessageHover = () => {
    if (message.isBot) {
      setShowEmoji(true);
      setEmojiPosition({
        x: Math.random() * 40 - 20,
        y: -20 - Math.random() * 20,
      });
      setTimeout(() => setShowEmoji(false), 1000);
    }
  };

  // Parse message content if it's a bot message
  const sections = message.isBot ? parseMessageContent(message.content) : null;

  return (
    <div
      className={cn("flex w-full my-4 relative", {
        "justify-end": !message.isBot,
        "justify-start": message.isBot
      })}
    >
      {showEmoji && message.isBot && (
        <motion.div
          className="absolute text-base sm:text-lg z-10"
          style={{
            left: message.isBot ? "2rem" : "auto",
            right: message.isBot ? "auto" : "2rem",
            top: "0",
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
          animate={{
            x: emojiPosition.x,
            y: emojiPosition.y,
            opacity: [0, 1, 0],
            scale: [0.5, 1.2, 0.8],
            rotate: [-5, 5, -5],
          }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          {Math.random() > 0.5 ? "💕" : "✨"}
        </motion.div>
      )}

      {message.isBot && decoration && (
        <motion.div 
          className="absolute -top-2 sm:-top-3 -left-1 text-xs sm:text-sm"
          animate={{ 
            y: [0, -3, 0],
            rotate: [0, 10, 0, -10, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ 
            duration: 3,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        >
          {decoration}
        </motion.div>
      )}

      {message.isBot && (
        <Avatar className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 border border-pink-300 shadow-md">
          <motion.div
            whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
            transition={{ rotate: { duration: 0.5 } }}
          >
            <img
              src="/images/sava.jpg"
              alt="Sakura AI"
              className="w-full h-full object-cover rounded-full border-2 border-pink-400 shadow-md"
            />
          </motion.div>
        </Avatar>
      )}

      <motion.div
        initial={message.isBot ? { x: -10, opacity: 0 } : { x: 10, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        whileHover={message.isBot ? { scale: 1.02 } : { scale: 1 }}
        onHoverStart={handleBotMessageHover}
        className={cn("max-w-[85%] sm:max-w-[75%] rounded-xl", {
          "ml-auto self-end": !message.isBot,
          "mr-auto self-start ml-2 sm:ml-3": message.isBot,
        })}
      >
        <Card
  className={cn(
    "px-2 py-1.5 sm:px-4 sm:py-3 text-sm sm:text-base",
    {
      "bg-[#FFB7C5] text-black border border-[#FF98A5] shadow-md": !message.isBot,
      "bg-gradient-to-br from-white to-pink-50 text-black border border-pink-100 shadow-md": message.isBot,
    }
  )}
>
  <div className="prose prose-xs sm:prose-sm break-words font-medium w-full">
    {message.isBot && sections ? (
      <>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto w-full">
                <table className="text-[11px] sm:text-sm border-collapse w-full min-w-[400px]" {...props} />
              </div>
            ),
            td: ({ node, ...props }) => (
              <td className="border border-pink-200 px-1 py-0.5 sm:px-2 sm:py-1" {...props} />
            ),
            th: ({ node, ...props }) => (
              <th className="border border-pink-300 bg-pink-50 px-1 py-0.5 sm:px-2 sm:py-1" {...props} />
            ),
          }}
        >
          {sections.mainText}
        </ReactMarkdown>

        {/* Source sections */}
        <div className="space-y-2">
          {sections.companyDocs && (
            <MessageSection
              title="社内文書情報"
              content={sections.companyDocs}
              icon={FileText}
            />
          )}

          {sections.onlineInfo && (
            <MessageSection
              title="オンラインWeb情報"
              content={sections.onlineInfo}
              icon={Globe}
            />
          )}
        </div>
      </>
    ) : (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto w-full">
              <table className="text-[11px] sm:text-sm border-collapse w-full min-w-[400px]" {...props} />
            </div>
          ),
          td: ({ node, ...props }) => (
            <td className="border border-pink-200 px-1 py-0.5 sm:px-2 sm:py-1" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="border border-pink-300 bg-pink-50 px-1 py-0.5 sm:px-2 sm:py-1" {...props} />
          ),
        }}
      >
        {message.content}
      </ReactMarkdown>
    )}
  </div>

          {message.timestamp && (
            <div className="text-[9px] sm:text-[10px] text-gray-400 mt-1 text-right">
              {formatTimestamp(message.timestamp)}
            </div>
          )}
</Card>

      </motion.div>
    </div>
  );
}