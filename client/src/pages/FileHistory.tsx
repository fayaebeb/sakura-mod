import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, FileText, CheckCircle, XCircle, Clock, Trash2 } from "lucide-react";
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

  const { data: files = [], isLoading } = useQuery<FileRecord[]>({
    queryKey: ["/api/files"],
    queryFn: async () => {
      const res = await fetch("/api/files", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch file history");
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

  function formatFileSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
      <Button
  variant="ghost"
  onClick={() => setLocation("/")}
  className="flex items-center gap-2"
>
  <ArrowLeft className="h-4 w-4" />
  チャットに戻る
</Button>
<h1 className="text-2xl font-bold">ファイルアップロード履歴</h1>

      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : files.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
  まだファイルがアップロードされていません。
</Card>

      ) : (
        <div className="grid gap-4">
  {files.map((file) => (
    <Card key={file.id} className="p-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10">
          {getStatusIcon(file.status)}
        </div>
        <div className="flex-1">
          <h3 className="font-medium">{file.originalName}</h3>
          <div className="text-sm text-muted-foreground">
            <span>{formatFileSize(file.size)}</span>
            <span className="mx-2">•</span>
            <span>{format(new Date(file.createdAt), "PPp")}</span>
            <span className="mx-2">•</span>
            <span>アップロード者: {file.user ? file.user.username.split('@')[0] : '不明'}</span>
          </div>
        </div>
      </div>
    </Card>
  ))}
</div>

                <div className="flex items-center gap-2">
                  <span className="text-sm capitalize px-2 py-1 rounded-full bg-muted">
                    {file.status}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
  );
}