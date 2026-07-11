import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Music, Play, Clock, Image as ImageIcon, AlertCircle, CheckCircle2 } from "lucide-react";
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
  const [url, setUrl] = useState("");
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>("");
  const [selectedAudioFormat, setSelectedAudioFormat] = useState<string>("mp3");
  const [downloadType, setDownloadType] = useState<"video" | "audio">("video");
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fetchMetadataQuery = trpc.downloader.fetchMetadata.useQuery(
    { url: url.trim() },
    { enabled: url.trim().length > 0, retry: false }
  );
  const downloadMutation = trpc.downloader.download.useMutation();

  // Update metadata when query completes
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

      // Trigger download via token
      const downloadUrl = `/api/download/${result.downloadToken}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Downloaded: ${result.filename}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setIsDownloading(false);
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
                  aria-label="Video URL input"
                />
              </div>

              {/* Loading State */}
              {fetchMetadataQuery.isLoading && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 animate-in fade-in duration-300">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span>Analyzing video...</span>
                </div>
              )}

              {/* Error State */}
              {fetchMetadataQuery.isError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-in fade-in duration-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{fetchMetadataQuery.error?.message || "Failed to fetch video metadata"}</span>
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

                  {/* Download Button */}
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

        {/* Empty State */}
        {!videoMetadata && !fetchMetadataQuery.isLoading && (
          <div className="max-w-3xl mx-auto text-center py-12">
            <ImageIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No downloads yet. Start by pasting a video URL above!</p>
          </div>
        )}
      </main>
    </div>
  );
}
