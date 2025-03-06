import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowLeft, FileText, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

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
          Back to Chat
        </Button>
        <h1 className="text-2xl font-bold">File Upload History</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : files.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No files have been uploaded yet.
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
                    <span>Uploaded by: {file.user ? file.user.username.split('@')[0] : 'Unknown'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm capitalize px-2 py-1 rounded-full bg-muted">
                    {file.status}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
