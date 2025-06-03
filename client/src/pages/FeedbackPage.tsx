import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Star, 
  StarIcon, 
  Search, 
  Calendar, 
  User, 
  BarChart, 
  Filter, 
  RefreshCw,
  MessageSquare,
  ThumbsUp,
  ThumbsDown, ArrowUpDown, Info, Sparkles, SquareTerminal
} from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";

// フィードバック interface matching our schema
interface フィードバック {
  id: number;
  userId: number;
  sessionId: string | null;
  comment: string | null;
  rating: number;
  createdAt: string;
}

type SortOption = "newest" | "oldest" | "highest" | "lowest";
type FilterOption = "all" | "withComments" | "highRating" | "lowRating";

export default function フィードバックPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const isMobile = useIsMobile();

  // Query to fetch すべてのフィードバック entries
  const {
    data: feedbackEntries,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ["/api/moderator/feedback"],
    queryFn: async () => {
      const res = await fetch("/api/moderator/feedback");
      if (!res.ok) throw new Error("Failed to fetch feedback");
      return res.json() as Promise<フィードバック[]>;
    },
    retry: 1
  });

  // Calculate feedback statistics
  const stats = useMemo(() => {
    if (!feedbackEntries?.length) return null;

    const totalEntries = feedbackEntries.length;
    const avgRating = feedbackEntries.reduce((sum, entry) => sum + entry.rating, 0) / totalEntries;
    const entriesWithComments = feedbackEntries.filter(entry => entry.comment).length;
    const ratingsDistribution = {
      5: feedbackEntries.filter(entry => entry.rating === 5).length,
      4: feedbackEntries.filter(entry => entry.rating === 4).length,
      3: feedbackEntries.filter(entry => entry.rating === 3).length,
      2: feedbackEntries.filter(entry => entry.rating === 2).length,
      1: feedbackEntries.filter(entry => entry.rating === 1).length,
    };

    return {
      totalEntries,
      avgRating,
      entriesWithComments,
      ratingsDistribution,
    };
  }, [feedbackEntries]);

  // Apply filtering based on selected criteria
  const filteredByOptions = useMemo(() => {
    if (!feedbackEntries) return [];

    let result = [...feedbackEntries];

    // Apply search filter
    if (searchTerm) {
      result = result.filter(feedback => {
        const searchableTerm = 
          `${feedback.userId} ${feedback.sessionId || ""} ${feedback.comment || ""}`
          .toLowerCase();
        return searchableTerm.includes(searchTerm.toLowerCase());
      });
    }

    // Apply category filter
    switch (filterBy) {
      case "withComments":
        result = result.filter(feedback => feedback.comment);
        break;
      case "highRating":
        result = result.filter(feedback => feedback.rating >= 4);
        break;
      case "lowRating":
        result = result.filter(feedback => feedback.rating <= 2);
        break;
      default:
        // "all" - no filtering needed
        break;
    }

    // Apply sorting
    switch (sortBy) {
      case "newest":
        result = result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "oldest":
        result = result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "highest":
        result = result.sort((a, b) => b.rating - a.rating);
        break;
      case "lowest":
        result = result.sort((a, b) => a.rating - b.rating);
        break;
    }

    return result;
  }, [feedbackEntries, searchTerm, sortBy, filterBy]);

  // Helper function to render star ratings
  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <StarIcon
            key={i}
            size={16}
            className={i < rating 
              ? rating >= 4 
                ? "fill-green-500 text-green-500" 
                : rating <= 2 
                  ? "fill-red-400 text-red-400"
                  : "fill-yellow-400 text-yellow-400"
              : "text-gray-300"
            }
          />
        ))}
      </div>
    );
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "yyyy-MM-dd HH:mm");
    } catch (error) {
      return "Invalid date";
    }
  };

  // Handle refresh button click
  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshing feedback data",
      description: "The latest feedback data is being loaded",
      duration: 3000,
    });
  };

  const [summary, setSummary] = useState("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const handleGenerateSummary = async () => {
    if (!feedbackEntries || feedbackEntries.length === 0) return;

    const comments = feedbackEntries
      .filter((f) => f.comment)
      .map((f) => f.comment!); // Non-null since filtered

    setIsGeneratingSummary(true);
    try {
      const res = await fetch("/api/moderator/feedback/summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comments }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Unknown error");

      setSummary(data.summary || "要約に失敗しました。");
    } catch (error) {
      setSummary("エラーが発生しました。");
    } finally {
      setIsGeneratingSummary(false);
    }
  };



  // Get appropriate feedback card border color based on rating
  const getフィードバックCardStyle = (rating: number) => {
    if (rating >= 4) return "border-l-green-500";
    if (rating <= 2) return "border-l-red-400";
    return "border-l-blue-400";
  };

  // Helper to render the rating distribution bar
  const renderRatingBar = (count: number, total: number) => {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="flex items-center gap-2">
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-primary h-2.5 rounded-full"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <span className="text-xs font-medium">{count}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>フィードバックデータを読み込んでいます...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>エラー</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">フィードバックデータの読み込みに失敗しました: {error instanceof Error ? error.message : "Unknown error"}</p>
            <Button className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              再試行
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
            <div className="bg-gradient-to-br from-[#fff1f2] via-[#ffeae5] to-[#fff4e6] min-h-screen">
              <div className="container mx-auto p-4">
                <Tabs defaultValue="feedback" className="w-full">
                  <div className={`${isMobile ? "flex flex-col gap-3" : "flex justify-between items-center"} mb-4`}>

                    {/* Mobile-only row: ダッシュボードに戻る + 更新 */}
                    {isMobile && (
                      <div className="flex justify-between items-center w-full">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation("/moderator")}
                        >
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          ダッシュボードに戻る
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRefresh}
                          className="sm:hidden"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          更新
                        </Button>
                      </div>
                    )}

            {/* Desktop-only: ダッシュボードに戻る */}
            {!isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/moderator")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                ダッシュボードに戻る
              </Button>
            )}

            {/* Tabs */}
              <TabsList
                className={`rounded-md border bg-white/60 backdrop-blur-sm shadow-sm ${
                  isMobile ? "w-full" : ""
                }`}
              >
              <TabsTrigger value="feedback" className={isMobile ? "flex-1" : ""}>
                <MessageSquare className="h-4 w-4 mr-2" />
                フィードバック
              </TabsTrigger>
              <TabsTrigger value="analytics" className={isMobile ? "flex-1" : ""}>
                <BarChart className="h-4 w-4 mr-2" />
                分析
              </TabsTrigger>
            </TabsList>

            {/* Desktop-only: 更新 */}
            {!isMobile && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="hidden sm:flex"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                更新
              </Button>
            )}
          </div>


                <TabsContent value="feedback">
                  <Card className="border shadow-sm bg-white/70 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <div>
                        <CardTitle>ユーザーフィードバック</CardTitle>
                        <CardDescription className="hidden sm:block">
                          ユーザーからの評価とコメントを表示・分析します
                        </CardDescription>
              </div>

              <div className="mt-4 flex flex-col gap-4">
                <div className="flex items-center w-full">
                  <Search className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <Input
                    placeholder="フィードバックを検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className={`${isMobile ? 'flex flex-row gap-2' : 'flex gap-4 justify-start'}`}>
                  {/* Filter */}
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Select value={filterBy} onValueChange={(value) => setFilterBy(value as FilterOption)}>
                      <SelectTrigger className={isMobile ? "w-full" : "w-60"}>
                        <SelectValue placeholder="すべてのフィードバック" title="すべてのフィードバック" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">すべてのフィードバック</SelectItem>
                        <SelectItem value="withComments">コメントあり</SelectItem>
                        <SelectItem value="highRating">高評価（4〜5）</SelectItem>
                        <SelectItem value="lowRating">低評価（1〜2）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort */}
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                      <SelectTrigger className={isMobile ? "w-full" : "w-48"}>
                        <SelectValue placeholder="新しい順" title="新しい順" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">新しい順</SelectItem>
                        <SelectItem value="oldest">古い順</SelectItem>
                        <SelectItem value="highest">高評価順</SelectItem>
                        <SelectItem value="lowest">低評価順</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </div>
            </CardHeader>

                <CardContent className="bg-white/50 backdrop-blur-sm rounded-md">
                  <ScrollArea className={isMobile ? "h-[400px]" : "h-[600px]"}>
                {filteredByOptions.length > 0 ? (
                  <div className="space-y-4">
                    {filteredByOptions.map((feedback) => (
                      <Card 
                        key={feedback.id} 
                        className={`p-4 border-l-4 ${getフィードバックCardStyle(feedback.rating)} hover:shadow-md transition-shadow`}
                      >
                        <div className="w-full">
                          {isMobile ? (
                            // 👉 Mobile: User + Stars in same line
                            <div className="flex justify-between items-center w-full">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 flex-shrink-0" />
                                <span className="font-medium truncate">{feedback.sessionId}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="text-sm font-medium">評価:</span>
                                {renderStars(feedback.rating)}
                                {feedback.rating >= 4 ? (
                                  <ThumbsUp className="h-4 w-4 text-green-500" />
                                ) : feedback.rating <= 2 ? (
                                  <ThumbsDown className="h-4 w-4 text-red-500" />
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            // 👉 Desktop: Left = User, Right = Stars
                            <div className="flex justify-between items-center w-full">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 flex-shrink-0" />
                                <span className="font-medium truncate">{feedback.sessionId}</span>
                                <Badge className="ml-1" variant="outline">
                                  ユーザー ID: {feedback.userId}
                                </Badge>
                              </div>
                              <div className="flex items-center space-x-1 whitespace-nowrap">
                                <span className="text-sm font-medium">評価:</span>
                                {renderStars(feedback.rating)}
                                {feedback.rating >= 4 ? (
                                  <ThumbsUp className="h-4 w-4 text-green-500" />
                                ) : feedback.rating <= 2 ? (
                                  <ThumbsDown className="h-4 w-4 text-red-500" />
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>


                        {feedback.comment ? (
                          <div className="mt-3 p-3 bg-muted rounded-md">
                            <p className="text-sm">{feedback.comment}</p>
                          </div>
                        ) : (
                          <div className="mt-3 p-3 bg-gray-50 rounded-md border border-dashed border-gray-200">
                            <p className="text-xs text-muted-foreground italic">コメントはありません</p>
                          </div>
                        )}

                        <div className="mt-2 flex justify-end">
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(feedback.createdAt)}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40">
                    <Star className="h-10 w-10 text-muted-foreground mb-2" />
                    {searchTerm || filterBy !== "all" ? (
                      <p className="text-muted-foreground">条件に一致するフィードバックはありません</p>
                    ) : (
                      <p className="text-muted-foreground">フィードバックが見つかりません</p>
                    )}
                  </div>
                )}
              </ScrollArea>
            </CardContent>

            <CardFooter className="border-t pt-4 flex flex-col sm:flex-row sm:justify-between gap-3">
              {/* Line 1: Feedback summary */}
              <div className="text-sm text-muted-foreground">
                {filteredByOptions.length > 0 && (
                  <p className="sm:inline">
                    全{feedbackEntries?.length}件中{filteredByOptions.length}件のフィードバックを表示中
                  </p>
                )}
              </div>

              {/* Line 2: Stats - average & comment count together */}
              {stats && (
                <div className="flex flex-row gap-4 sm:gap-6 items-start sm:items-center">
                  <div className="flex items-center">
                    <Star className="h-4 w-4 text-yellow-400 mr-1" />
                    <span className="text-sm font-medium">
                      平均 {stats.avgRating.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <MessageSquare className="h-4 w-4 text-blue-500 mr-1" />
                    <span className="text-sm font-medium">
                      コメントあり {stats.entriesWithComments} 件
                    </span>
                  </div>
                </div>
              )}
            </CardFooter>

          </Card>
        </TabsContent>

              <TabsContent value="analytics">
                <Card className="bg-white/70 backdrop-blur-sm shadow-sm border">
                  <CardHeader>
                    <CardTitle>フィードバック分析</CardTitle>
                    <CardDescription>
                      ユーザーフィードバックと評価の統計概要
                    </CardDescription>
            </CardHeader>

            <CardContent>
              {stats ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="p-4 border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">総フィードバック数</p>
                          <h3 className="text-2xl font-bold">{stats.totalEntries}</h3>
                        </div>
                        <MessageSquare className="h-8 w-8 text-primary opacity-80 flex-shrink-0" />
                      </div>
                    </Card>

                    <Card className="p-4 border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">平均評価</p>
                          <h3 className="text-2xl font-bold flex items-center">
                            {stats.avgRating.toFixed(1)}
                            <StarIcon className="h-4 w-4 text-yellow-400 ml-1" />
                          </h3>
                        </div>
                        <Star className="h-8 w-8 text-yellow-400 flex-shrink-0" />
                      </div>
                    </Card>

                    <Card className="p-4 border">
                      <div className="flex items-center justify-between">
                        <div className="pr-2">
                          <p className="text-sm font-medium text-muted-foreground">コメントあり</p>
                          <h3 className="text-2xl font-bold flex flex-wrap items-center">
                            {stats.entriesWithComments}
                            <span className="text-sm text-muted-foreground ml-1 whitespace-nowrap">
                              ({Math.round((stats.entriesWithComments / stats.totalEntries) * 100)}%)
                            </span>
                          </h3>
                        </div>
                        <MessageSquare className="h-8 w-8 text-blue-500 flex-shrink-0" />
                      </div>
                    </Card>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-4">評価の分布</h3>
                    <div className="space-y-3">
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <div key={rating} className="flex items-center">
                          <div className="w-24 flex items-center">
                            <span className="text-sm font-medium mr-2">{rating}</span>
                            {renderStars(rating)}
                          </div>
                          {renderRatingBar(stats.ratingsDistribution[rating as keyof typeof stats.ratingsDistribution], stats.totalEntries)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-2">感情分析</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Card className="p-4 border-green-200 bg-green-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center">
                              <ThumbsUp className="h-4 w-4 text-green-600 mr-2" />
                              <p className="text-sm font-medium text-green-700">ポジティブ（4〜5）</p>
                            </div>
                            <h3 className="text-xl font-bold text-green-800 mt-1">
                              {stats.ratingsDistribution[4] + stats.ratingsDistribution[5]}
                              <span className="text-sm font-normal ml-1">
                                ({Math.round(((stats.ratingsDistribution[4] + stats.ratingsDistribution[5]) / stats.totalEntries) * 100)}%)
                              </span>
                            </h3>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4 border-yellow-200 bg-yellow-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center">
                              <StarIcon className="h-4 w-4 text-yellow-600 mr-2" />
                              <p className="text-sm font-medium text-yellow-700">中立（3）</p>
                            </div>
                            <h3 className="text-xl font-bold text-yellow-800 mt-1">
                              {stats.ratingsDistribution[3]}
                              <span className="text-sm font-normal ml-1">
                                ({Math.round((stats.ratingsDistribution[3] / stats.totalEntries) * 100)}%)
                              </span>
                            </h3>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4 border-red-200 bg-red-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center">
                              <ThumbsDown className="h-4 w-4 text-red-600 mr-2" />
                              <p className="text-sm font-medium text-red-700">ネガティブ（1〜2）</p>
                            </div>
                            <h3 className="text-xl font-bold text-red-800 mt-1">
                              {stats.ratingsDistribution[1] + stats.ratingsDistribution[2]}
                              <span className="text-sm font-normal ml-1">
                                ({Math.round(((stats.ratingsDistribution[1] + stats.ratingsDistribution[2]) / stats.totalEntries) * 100)}%)
                              </span>
                            </h3>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40">
                  <BarChart className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">分析データがありません</p>
                </div>
              )}
            </CardContent>
          </Card>

                <Card className="mt-8 p-6 border border-muted-foreground/10 shadow-md bg-white/80 backdrop-blur-md rounded-2xl transition-shadow duration-300 hover:shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <SquareTerminal className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold tracking-tight whitespace-nowrap">
                        AIによる要約
                      </h3>
                    </div>

                    <Button
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary}
                      aria-busy={isGeneratingSummary}
                      title="AIでフィードバックの要約を生成"
                      className="relative overflow-hidden rounded-full px-6 py-2 font-medium text-transparent bg-white/80 backdrop-blur-md border-2 border-transparent transition-all duration-300 hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                      style={{
                        backgroundImage:
                          "linear-gradient(white, white), linear-gradient(to right, #00f0ff, #8b5cf6, #ec4899)",
                        backgroundOrigin: "border-box",
                        backgroundClip: "padding-box, border-box",
                      }}
                    >
                      <div className="flex items-center gap-2 text-gradient bg-clip-text text-transparent bg-[linear-gradient(to_right,#00f0ff,#8b5cf6,#ec4899)]">
                        <AnimatePresence mode="wait" initial={false}>
                          {isGeneratingSummary ? (
                            <motion.div
                              key="spinner"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.2 }}
                            >
                              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="sparkle"
                              initial={{ opacity: 0, scale: 1.2 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.2 }}
                            >
                              <Sparkles className="h-5 w-5 text-cyan-400 drop-shadow-glow animate-sparkle" />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <span className="sm:inline hidden">
                          {isGeneratingSummary ? "生成中..." : "フィードバック要約を生成"}
                        </span>
                        <span className="sm:hidden inline">生成</span>
                      </div>
                    </Button>

                  </div>

              {summary ? (
                <div className="bg-white border border-muted rounded-md p-4 text-base text-foreground leading-relaxed shadow-sm animate-fade-in-up">
                  <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                    <div className="flex items-center text-sm text-muted-foreground italic animate-fade-in">
                      <Info className="h-4 w-4 mr-2" />
                      生成された要約はここに表示されます
                    </div>
                  )}
                </Card>

        </TabsContent>
      </Tabs>
    </div>
              </div>
  );
}