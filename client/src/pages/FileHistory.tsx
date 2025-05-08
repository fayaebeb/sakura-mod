import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState } from "react";
import { 
  ArrowLeft, FileText, CheckCircle, XCircle, Clock, Trash2, 
  Search, Home, File, Filter, SortAsc
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

interface FileRecord {
  id: number;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  status: string;
  createdAt: string;
  user: {
    username: string;
  } | null;
}

export default function FileHistory() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("latest");

  const { data: files = [], isLoading } = useQuery<FileRecord[]>({
    queryKey: ["/api/files"],
    queryFn: async () => {
      const res = await fetch("/api/files", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("ファイル履歴の取得に失敗しました");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('ファイルの削除に失敗しました');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/files'] });
      toast({
        title: "成功",
        description: "ファイルを削除しました",
      });
    },
    onError: (error) => {
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function getStatusIcon(status: string) {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "processing":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "completed":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">完了</Badge>;
      case "error":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">エラー</Badge>;
      case "processing":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">処理中</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">{status}</Badge>;
    }
  }

  function getFileTypeIcon(contentType: string) {
    if (contentType.includes("image")) {
      return <FileText className="h-5 w-5 text-blue-500" />;
    } else if (contentType.includes("pdf")) {
      return <FileText className="h-5 w-5 text-red-500" />;
    } else if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("csv")) {
      return <FileText className="h-5 w-5 text-green-600" />;
    } else if (contentType.includes("text") || contentType.includes("javascript") || contentType.includes("json")) {
      return <FileText className="h-5 w-5 text-purple-500" />;
    } else {
      return <File className="h-5 w-5 text-gray-500" />;
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  // Filter and sort files
  const filteredFiles = files
    .filter(file => {
      // Apply search filter
      const searchMatch = searchQuery === "" || 
        file.originalName.toLowerCase().includes(searchQuery.toLowerCase());

      // Apply status filter
      const statusMatch = statusFilter === "all" || file.status === statusFilter;

      return searchMatch && statusMatch;
    })
    .sort((a, b) => {
      // Sort by selected criteria
      if (sortBy === "latest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === "name") {
        return a.originalName.localeCompare(b.originalName);
      } else if (sortBy === "size") {
        return b.size - a.size;
      }
      return 0;
    });

  return (
    // Outer wrapper: full screen gradient background with flex layout
    <div className="min-h-screen bg-gradient-to-b from-[#fff1f2] via-[#ffeae5] to-[#fff4e6] flex flex-col">
      {/* Fixed header with gradient background */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-[#fff1f2] to-[#fff4e6] shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-5xl">
          {/* Header with back button and title */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 border-b pb-3">
            {/* Left Section: Back Button + Title */}
            <div className="flex items-center gap-4">
              {/* Mobile Icon Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/")}
                className="sm:hidden hover:bg-muted transition-all duration-200"
                aria-label="ホームに戻る"
              >
                <ArrowLeft className="h-5 w-5 text-muted-foreground hover:scale-110 transition-transform duration-200" />
              </Button>

              {/* Desktop Button with label */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/")}
                className="hidden sm:flex items-center gap-2 px-3 hover:bg-muted transition-all duration-200"
                aria-label="ホームに戻る"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <span>戻る</span>
              </Button>

              {/* Title with stylization */}
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground drop-shadow-sm">
                📁 ファイル履歴
              </h1>
            </div>
          </div>

          {/* Filter and search controls */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ファイル名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter + Sort aligned in a row on mobile */}
            <div className="flex flex-row sm:flex-row gap-2 sm:w-auto w-full">
              <div className="relative flex-1 sm:flex-initial">
                <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[140px] pl-9">
                    <SelectValue placeholder="ステータス" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                    <SelectItem value="processing">処理中</SelectItem>
                    <SelectItem value="error">エラー</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative flex-1 sm:flex-initial">
                <SortAsc className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-[140px] pl-9">
                    <SelectValue placeholder="並び替え" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">最新順</SelectItem>
                    <SelectItem value="oldest">古い順</SelectItem>
                    <SelectItem value="name">名前順</SelectItem>
                    <SelectItem value="size">サイズ順</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>
        </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto pb-6 px-4">
        <div className="container mx-auto max-w-5xl">
          {/* Content area */}
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredFiles.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground mt-4">
              {searchQuery || statusFilter !== "all"
                ? "検索条件に一致するファイルがありません。"
                : "まだファイルがアップロードされていません。"}
            </Card>
          ) : (
            <div className="grid gap-4 mt-4">
              {filteredFiles.map((file) => (
                <Card key={file.id} className="overflow-hidden transition-all hover:shadow-md">
                  <div className={`flex ${isMobile ? "flex-col" : "flex-row"} p-4 gap-4`}>
                    {/* File type and status icons */}
                    <div className={`flex ${isMobile ? "flex-row justify-between" : "flex-col"} items-center justify-center w-10 min-w-10`}>
                      {getFileTypeIcon(file.contentType)}
                      {getStatusIcon(file.status)}
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-base text-primary truncate" title={file.originalName}>
                        {file.originalName}
                      </h3>
                      <div className={`text-sm text-muted-foreground ${isMobile ? "flex flex-col gap-1" : ""}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{formatFileSize(file.size)}</span>
                          {!isMobile && <span className="mx-1">•</span>}
                          <span>{format(new Date(file.createdAt), "PPp")}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span>アップロード者: {file.user ? file.user.username.split('@')[0] : '不明'}</span>
                          {getStatusBadge(file.status)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className={`flex ${isMobile ? "justify-end mt-2" : "items-center"} gap-2`}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label="ファイルを削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>ファイルの削除</AlertDialogTitle>
                            <AlertDialogDescription>
                              このファイルを削除してもよろしいですか？この操作は元に戻せません。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(file.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deleteMutation.isPending ? "削除中..." : "削除"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}