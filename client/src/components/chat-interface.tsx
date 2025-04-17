import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Send, Check, Sparkles, Heart, Upload, FileText, X, ChevronRight, MessageSquare } from "lucide-react";
import { Message } from "@shared/schema";
import { nanoid } from "nanoid";
import { apiRequest, queryClient } from "@/lib/queryClient";
import ChatMessage from "./chat-message";
import { ScrollArea } from "./ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const CHAT_SESSION_KEY_PREFIX = "chat_session_id_user_";
const TUTORIAL_SHOWN_KEY_PREFIX = "tutorial_shown_user_";
const WARNING_SHOWN_KEY_PREFIX = "warning_shown_user_";

const LoadingDots = () => {
  return (
    <div className="flex items-center gap-1.5 text-primary">
      <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
      <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
      <div className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
};

const Tutorial = ({ onClose }: { onClose: () => void }) => {
  const [step, setStep] = useState(1);
  const steps = [
    {
      title: "ようこそ！",
      description: "「桜AI」は、PCKKにおいて、情報提供や質問への回答を行うAIです。私の役割は、さまざまなトピックについて正確で分かりやすい情報を提供し、ユーザーのリクエストに的確にお応えすることです。たとえば、データに基づくご質問には、社内資料や外部情報を参照しながら丁寧にお答えします。",
      icon: <Sparkles className="h-5 w-5 text-pink-400" />
    },
    {
      title: "楽しくお話ししましょう！",
      description: "「桜AI」は、OpenAIの生成モデル「ChatGPT-4o」を使用しています。社内の全国うごき統計に関する営業資料や、人流に関する社内ミニ講座の内容を基礎データとして取り込み、さらにWikipediaやGoogleのAPIを通じてインターネット上の情報も収集しています。これらの情報をもとに、最適な回答を生成しています。",
      icon: <Heart className="h-5 w-5 text-red-400" />
    },
  ];
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md p-6 space-y-4 shadow-xl relative bg-white/95 border-0">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors rounded-full w-6 h-6 flex items-center justify-center"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            {steps[step - 1].icon}
          </div>
          <h3 className="text-xl font-semibold text-[#16213e]">{steps[step - 1].title}</h3>
        </div>
        <p className="text-muted-foreground leading-relaxed">{steps[step - 1].description}</p>
        <div className="flex justify-between items-center pt-4">
          <div className="flex gap-2">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full transition-colors ${idx + 1 === step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <Button
            onClick={() => {
              if (step < steps.length) {
                setStep(step + 1);
              } else {
                onClose();
              }
            }}
            className="bg-[#16213e] hover:bg-[#253758] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span>{step < steps.length ? "次へ" : "始めましょう！"}</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!user) return;
    const warningShownKey = `${WARNING_SHOWN_KEY_PREFIX}${user.id}`;
    const stored = localStorage.getItem(warningShownKey);

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    if (!stored || now - parseInt(stored, 10) > SEVEN_DAYS) {
      setShowWarning(true);
    }
  }, [user]);


  const [showTutorial, setShowTutorial] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  // New state to detect mobile devices
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    if (!user) return;
    const tutorialShownKey = `${TUTORIAL_SHOWN_KEY_PREFIX}${user.id}`;
    const tutorialShown = localStorage.getItem(tutorialShownKey);
    if (!tutorialShown) {
      setShowTutorial(true);
    }
  }, [user]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check for mobile device on mount
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobileDevice(window.innerWidth <= 480); // You can tweak the breakpoint if needed
    };

    checkIsMobile(); // Run on mount
    window.addEventListener("resize", checkIsMobile); // Update on window resize

    return () => {
      window.removeEventListener("resize", checkIsMobile);
    };
  }, []);


  const handleCloseTutorial = () => {
    if (!user) return;
    const tutorialShownKey = `${TUTORIAL_SHOWN_KEY_PREFIX}${user.id}`;
    setShowTutorial(false);
    localStorage.setItem(tutorialShownKey, 'true');
  };

  const handleCloseWarning = () => {
    if (!user) return;
    const warningShownKey = `${WARNING_SHOWN_KEY_PREFIX}${user.id}`;
    const now = Date.now();
    localStorage.setItem(warningShownKey, now.toString());
    setShowWarning(false);
  };


  const [sessionId, setSessionId] = useState<string>(() => {
    if (!user) return "";

    const storageKey = `${CHAT_SESSION_KEY_PREFIX}${user.id}`;
    const savedSessionId = localStorage.getItem(storageKey);
    if (savedSessionId) return savedSessionId;

    const newSessionId = nanoid();
    localStorage.setItem(storageKey, newSessionId);
    return newSessionId;
  });

  useEffect(() => {
    if (!user) return;

    const storageKey = `${CHAT_SESSION_KEY_PREFIX}${user.id}`;
    const savedSessionId = localStorage.getItem(storageKey);

    if (savedSessionId) {
      setSessionId(savedSessionId);
    } else {
      const newSessionId = nanoid();
      localStorage.setItem(storageKey, newSessionId);
      setSessionId(newSessionId);
    }
  }, [user]);

  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: ["/api/messages", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/messages/${sessionId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("メッセージを取ってこられなかったよ...ごめんね！");
      return res.json();
    },
    enabled: !!user && !!sessionId,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/chat", {
        content,
        sessionId,
        isBot: false,
      });
      return res.json();
    },
    onMutate: async (content: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/messages", sessionId] });

      const previousMessages = queryClient.getQueryData<Message[]>(["/api/messages", sessionId]) || [];
      const previousData = queryClient.getQueryData<Message[]>(["/api/messages", sessionId]) || [];

      // @ts-ignore - Bypassing type checks for optimistic UI updates
      queryClient.setQueryData<any>(["/api/messages", sessionId], [
        ...previousData,
        {
          id: parseInt(nanoid(), 36),
          content,
          isBot: false,
          userId: user?.id || 0,
          sessionId,
          timestamp: new Date(),
        }
      ]);

      return { previousMessages };
    },
    onSuccess: (newBotMessage: Message) => {
      queryClient.setQueryData<Message[]>(["/api/messages", sessionId], (old) => [
        ...(old || []),
        newBotMessage,
      ]);
      toast({
        title: "メッセージ送信したよ！",
        description: (
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" /> メッセージ届いたよ！ありがとう♡
          </div>
        ),
        duration: 2000,
      });
    },
    onError: (_, __, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/messages", sessionId], context.previousMessages);
      }
      toast({
        title: "送信エラー",
        description: "メッセージが送れなかったよ...もう一度試してみてね！",
        variant: "destructive",
      });
    },
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) throw new Error('ファイルのアップロードに失敗しました');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", sessionId] });
      toast({
        title: "ファイルのアップロードが完了しました！",
        description: (
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" /> ファイルを処理しています...
          </div>
        ),
        duration: 3000,
      });
      setFile(null);
    },
      onError: () => {
        toast({
          title: "ファイルのアップロードに失敗しました",
          description: "対応しているファイル形式（PDF、PPT、PPTX、DOCX、TXT、CSV、XLSX、XLS）で再試行してください。",
          variant: "destructive",
        });
        setFile(null);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null; 
    handleFileSelection(selectedFile);
  };

  const handleFileSelection = (selectedFile: File | null) => {
    if (!selectedFile) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', 
      'application/vnd.ms-powerpoint', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
      'text/plain',
      '.txt'
    ];

    if (!allowedTypes.includes(selectedFile.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a PDF, PPT, PPTX, DOCX, TXT, CSV, XLSX, or XLS file",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    uploadFile.mutate(selectedFile);
  };

  const [isDragging, setIsDragging] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the bottom whenever messages update
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, sendMessage.isPending, uploadFile.isPending]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const adjustHeight = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    };

    adjustHeight();

    return () => {
      textarea.style.height = 'auto';
    };
  }, [input]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    handleFileSelection(droppedFile);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessage.isPending) return;

    const message = input;
    setInput("");
    sendMessage.mutate(message);
  };

  if (isLoadingMessages) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <LoadingDots />
        <p className="text-sm text-muted-foreground animate-pulse">チャット履歴をお届け中...ちょっと待っててね！</p>
      </div>
    );
  }

  return (
    <Card
      className="flex flex-col h-[calc(100vh-12rem)] relative overflow-hidden shadow-lg border-0 bg-white/90 backdrop-blur-sm"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >


      {showTutorial && <Tutorial onClose={handleCloseTutorial} />}

      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary/50 rounded-lg z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-primary bg-white/80 p-6 rounded-xl backdrop-blur-sm shadow-lg">
            <FileText className="h-14 w-14" />
            <p className="text-lg font-medium">ドロップしてファイルをアップロード</p>
          </div>
        </div>
      )}

      <ScrollArea 
        ref={scrollAreaRef} 
        className={cn("flex-1 px-4 py-3", isDragging && "pointer-events-none")}
      >
        <div className="space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <div className="w-16 h-16 rounded-full bg-[#f8eee2] flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-[#16213e]" />
              </div>
              <h3 className="text-lg font-medium text-center mb-2">AIと会話を始めましょう</h3>
              <p className="text-center text-muted-foreground text-sm max-w-md">
                メッセージを送信するか、ファイルをアップロードして会話を開始できます。
              </p>
            </div>
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {(sendMessage.isPending || uploadFile.isPending) && (
            <div className="flex flex-col items-center gap-2 p-4 bg-[#f8eee2]/30 rounded-lg">
              <LoadingDots />
              <p className="text-sm text-muted-foreground">
                {uploadFile.isPending ? "ファイルを処理中です..." : "桜AIが一生懸命考えているよ...！"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {showWarning && (
        <div className="px-4 pb-2 relative">
          <div className="border-l-4 border-red-500 bg-red-50 text-red-700 px-4 py-3 text-sm rounded-md shadow-sm">
            <button
              onClick={handleCloseWarning}
              className="absolute top-2 right-3 text-red-400 hover:text-red-600 rounded-full w-5 h-5 flex items-center justify-center"
              aria-label="閉じる"
            >
              <X className="h-3 w-3" />
            </button>
            <strong className="block mb-1">❗注意：</strong>
            このデータ入力パネルでは「こんにちは」「質問」などの不要なメッセージや、誤った情報は入力しないでください。AIの記憶に保存されてしまいます。
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2 bg-[#fcfaf5]">
        <Input
          type="file"
          id="file-upload"
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.ppt,.pptx,.docx,.txt,.csv,.xlsx,.xls,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/csv"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => document.getElementById('file-upload')?.click()}
          disabled={uploadFile.isPending}
          className="bg-white hover:bg-gray-100 border-[#e8d9c5]"
        >
          <Upload className="h-4 w-4 text-[#16213e]" />
        </Button>
        <div className="flex-1 relative rounded-md overflow-hidden border border-[#e8d9c5] focus-within:ring-1 focus-within:ring-[#16213e] focus-within:border-[#16213e] bg-white">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={   isMobileDevice     ? "📝 テキスト 🔗 URL 📁 ファイル"     : "📝 テキスト 🔗 URL 📁 ファイルをここに入力・アップロードできます" }
            className="flex-1 min-h-[40px] max-h-[150px] resize-none overflow-y-auto border-0 focus-visible:ring-0 px-3 py-2 text-sm sm:text-base"

            style={{ height: 'auto' }}
            onKeyDown={(e) => {
              // On non-mobile devices, Enter (without Shift) will submit the message
              if (!isMobileDevice && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !sendMessage.isPending) {
                  handleSubmit(e);
                }
              }
            }}
          />
        </div>
        <Button
          type="submit"
          disabled={sendMessage.isPending || uploadFile.isPending}
          className="bg-[#f5d0c5] hover:bg-[#f1a7b7] text-[#6b4c3b] hover:text-white transition-all duration-300 rounded-full p-3 flex items-center justify-center shadow-lg"
        >
          <Send className="h-5 w-5" />
        </Button>


      </form>
    </Card>
  );
}