import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Music, Play, Clock, Image as ImageIcon, AlertCircle, CheckCircle2, Cookie, X } from "lucide-react";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { getPlatformInfo } from "@/lib/platformUtils";
import { toast } from "sonner";

interface VideoMetadata {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  platform: string;
  formats: Array<{
    formatId: string;
    ext: string;
    resolution: string;
    fps?: number;
    codec?: string;
    bitrate?: string;
  }>;
  audioFormats: string[];
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [url, setUrl] = useState("");
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>("");
  const [selectedAudioFormat, setSelectedAudioFormat] = useState<string>("mp3");
  const [downloadType, setDownloadType] = useState<"video" | "audio">("video");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadHistory, setDownloadHistory] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [sessionDownloads, setSessionDownloads] = useState<any[]>([]);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [cookieText, setCookieText] = useState("");
  const [cookiesSaved, setCookiesSaved] = useState(false);

  const fetchMetadataQuery = trpc.downloader.fetchMetadata.useQuery(
    { url: url.trim() },
    { enabled: url.trim().length > 0, retry: false }
  );
  const downloadMutation = trpc.downloader.download.useMutation();
  const saveCookiesMutation = trpc.cookies.setInstagram.useMutation();
  const historyQuery = trpc.downloader.getHistory.useQuery(
    { limit: 20 },
    { enabled: !!user }
  );

  useEffect(() => {
    if (fetchMetadataQuery.data) {
      setVideoMetadata(fetchMetadataQuery.data);
      setShowPreview(true);
      if (fetchMetadataQuery.data.formats.length > 0) {
        setSelectedQuality(fetchMetadataQuery.data.formats[0].formatId);
      }
    } else {
      setVideoMetadata(null);
      setShowPreview(false);
    }
  }, [fetchMetadataQuery.data]);

  useEffect(() => {
    if (historyQuery.data) {
      setDownloadHistory(historyQuery.data);
    }
  }, [historyQuery.data]);

  const handleDownload = async () => {
    if (!videoMetadata) {
      toast.error("Please enter a valid URL first");
      return;
    }

    setIsDownloading(true);
    try {
      const result = await downloadMutation.mutateAsync({
        url: url.trim(),
        quality: downloadType === "video" ? selectedQuality : undefined,
        audioOnly: downloadType === "audio",
        audioFormat: downloadType === "audio" ? (selectedAudioFormat as "mp3" | "m4a") : undefined,
      });

      const downloadUrl = `/api/download/${result.downloadToken}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Downloaded: ${result.filename}`);

      // Add to session downloads (for display without auth)
      setSessionDownloads(prev => [{
        id: Date.now().toString(),
        title: result.title,
        filename: result.filename,
        platform: videoMetadata.platform,
        thumbnail: videoMetadata.thumbnail,
        downloadType: downloadType,
        quality: downloadType === "video" ? selectedQuality : undefined,
        createdAt: new Date().toISOString(),
      }, ...prev]);

      // Refresh history if authenticated
      if (user) {
        await historyQuery.refetch();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveCookies = async () => {
    if (!cookieText.trim()) {
      toast.error("Please paste your Instagram cookies");
      return;
    }
    try {
      await saveCookiesMutation.mutateAsync({ content: cookieText.trim() });
      setCookiesSaved(true);
      setShowCookieModal(false);
      toast.success("Instagram cookies saved! Try the download again.");
    } catch (err) {
      toast.error("Failed to save cookies. Try again.");
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const displayHistory = user ? downloadHistory : sessionDownloads;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">VideoFlow</h1>
              <p className="text-xs text-slate-500">Download videos effortlessly</p>
            </div>
          </div>
          <div>
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Free Downloads — No Sign-in Required</p>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="max-w-3xl mx-auto mb-12">
          <div className="text-center mb-8 space-y-3">
            <h2 className="text-5xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              Download Videos Effortlessly
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Extract videos and audio from Instagram, YouTube, TikTok, and more. Choose your quality and format with precision.
            </p>
          </div>

          {/* URL Input Section */}
          <Card className="p-6 shadow-lg border-slate-200 hover:shadow-xl transition-shadow duration-300">
            <div className="space-y-4">
              <div>
                <label htmlFor="video-url" className="block text-sm font-semibold text-slate-700 mb-2">
                  Video URL
                </label>
                <Input
                  id="video-url"
                  type="url"
                  placeholder="Paste your video URL here (Instagram, YouTube, TikTok, etc.)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="text-base border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={authLoading}
                  aria-label="Video URL input"
                />
              </div>

              {fetchMetadataQuery.isLoading && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 animate-in fade-in duration-300">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span>Analyzing video...</span>
                </div>
              )}

              {fetchMetadataQuery.isError && (
                <div className="flex flex-col gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{fetchMetadataQuery.error?.message || "Failed to fetch video metadata"}</span>
                  </div>
                  {url.toLowerCase().includes("instagram") && (
                    <div className="flex items-center gap-2 pl-6">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCookieModal(true)}
                        className="text-xs border-red-300 text-red-700 hover:bg-red-100"
                      >
                        <Cookie className="w-3 h-3 mr-1" />
                        Paste Instagram Cookies
                      </Button>
                      {cookiesSaved && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Saved
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Video Preview & Download Section */}
        {videoMetadata && showPreview && (
          <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Preview Card */}
              <div className="md:col-span-1">
                <Card className="overflow-hidden shadow-lg border-slate-200 hover:shadow-xl transition-shadow duration-300">
                  <div className="relative group">
                    {videoMetadata.thumbnail && (
                      <img
                        src={videoMetadata.thumbnail}
                        alt={videoMetadata.title}
                        className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 flex items-center justify-center transition-colors duration-300">
                      <Play className="w-12 h-12 text-white group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const platformInfo = getPlatformInfo(videoMetadata.platform);
                        const PlatformIcon = platformInfo.icon;
                        return (
                          <Badge className={`${platformInfo.bgColor} ${platformInfo.color} flex items-center gap-1`}>
                            <PlatformIcon className="w-3 h-3" />
                            {videoMetadata.platform}
                          </Badge>
                        );
                      })()}
                    </div>
                    <h3 className="font-semibold text-slate-900 line-clamp-2 text-sm leading-snug">
                      {videoMetadata.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span>{formatDuration(videoMetadata.duration)}</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Download Options */}
              <div className="md:col-span-2">
                <Card className="p-6 shadow-lg border-slate-200 hover:shadow-xl transition-shadow duration-300">
                  <Tabs value={downloadType} onValueChange={(v) => setDownloadType(v as "video" | "audio")}>
                    <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100">
                      <TabsTrigger value="video" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all duration-200">
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Video</span>
                      </TabsTrigger>
                      <TabsTrigger value="audio" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all duration-200">
                        <Music className="w-4 h-4" />
                        <span className="hidden sm:inline">Audio</span>
                      </TabsTrigger>
                    </TabsList>

                    {/* Video Download Options */}
                    <TabsContent value="video" className="space-y-4 animate-in fade-in duration-200">
                      <div>
                        <label htmlFor="quality-select" className="block text-sm font-semibold text-slate-700 mb-2">
                          Quality
                        </label>
                        <Select value={selectedQuality} onValueChange={setSelectedQuality}>
                          <SelectTrigger id="quality-select" className="border-slate-300 focus:ring-2 focus:ring-blue-500">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {videoMetadata.formats.map((format) => (
                              <SelectItem key={format.formatId} value={format.formatId}>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{format.resolution}</span>
                                  {format.fps && <span className="text-xs text-slate-500">@ {format.fps}fps</span>}
                                  {format.bitrate && <span className="text-xs text-slate-500">({format.bitrate})</span>}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    {/* Audio Download Options */}
                    <TabsContent value="audio" className="space-y-4 animate-in fade-in duration-200">
                      <div>
                        <label htmlFor="audio-format-select" className="block text-sm font-semibold text-slate-700 mb-2">
                          Audio Format
                        </label>
                        <Select value={selectedAudioFormat} onValueChange={setSelectedAudioFormat}>
                          <SelectTrigger id="audio-format-select" className="border-slate-300 focus:ring-2 focus:ring-blue-500">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mp3">
                              <span className="font-medium">MP3</span> - Universal compatibility
                            </SelectItem>
                            <SelectItem value="m4a">
                              <span className="font-medium">M4A</span> - Better quality
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>
                  </Tabs>

                  {/* Download Button — NO AUTH REQUIRED */}
                  <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full mt-6 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200 active:scale-95"
                    aria-busy={isDownloading}
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Download {downloadType === "audio" ? "Audio" : "Video"}
                      </>
                    )}
                  </Button>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Download History */}
        {displayHistory.length > 0 && (
          <div className="max-w-3xl mx-auto mt-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">Recent Downloads</h3>
            <div className="grid gap-4">
              {displayHistory.map((item, index) => (
                <Card
                  key={item.id}
                  className="p-4 border-slate-200 hover:shadow-md hover:border-slate-300 transition-all duration-300 animate-in fade-in slide-in-from-left-4"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start gap-4">
                    {item.thumbnail && (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-20 h-20 object-cover rounded-lg flex-shrink-0 shadow-sm hover:shadow-md transition-shadow duration-300"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-semibold text-slate-900 truncate">{item.title}</h4>
                        {(() => {
                          const platformInfo = getPlatformInfo(item.platform);
                          const PlatformIcon = platformInfo.icon;
                          return (
                            <Badge variant="outline" className="flex-shrink-0 flex items-center gap-1">
                              <PlatformIcon className="w-3 h-3" />
                              {item.platform}
                            </Badge>
                          );
                        })()}
                      </div>
                      <p className="text-sm text-slate-600 mb-2 truncate">{item.filename}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                          {item.downloadType === "audio" ? "Audio" : "Video"}
                        </span>
                        {item.quality && <span className="font-medium">{item.quality}</span>}
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {displayHistory.length === 0 && !videoMetadata && (
          <div className="max-w-3xl mx-auto text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <ImageIcon className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 text-lg">No downloads yet. Start by pasting a video URL above!</p>
          </div>
        )}
      </main>

      {/* Instagram Cookie Paste Modal */}
      {showCookieModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowCookieModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Cookie className="w-5 h-5 text-orange-500" />
                Paste Instagram Cookies
              </h3>
              <button onClick={() => setShowCookieModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Instagram blocks datacenter IPs. To download reels, paste your session cookies from Chrome DevTools.
            </p>
            <ol className="text-sm text-slate-600 space-y-1 list-decimal pl-5">
              <li>On your computer, open Chrome and go to <strong>instagram.com</strong> — log in</li>
              <li>Press <strong>F12</strong> → <strong>Application</strong> tab → <strong>Cookies</strong> → <strong>instagram.com</strong></li>
              <li>Find <strong>sessionid</strong> — double-click and copy the value</li>
              <li>Paste it below and click <strong>Save</strong></li>
            </ol>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500">Session ID (or full cookies.txt content)</label>
              <textarea
                value={cookieText}
                onChange={e => setCookieText(e.target.value)}
                placeholder="sessionid=ABC123...xyz  (or paste full Netscape cookies.txt here)"
                className="w-full h-32 text-xs font-mono p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleSaveCookies}
                disabled={saveCookiesMutation.isPending || !cookieText.trim()}
                className="flex-1"
              >
                {saveCookiesMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Save Cookies
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowCookieModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
