import { 
  Play, 
  Music, 
  MessageCircle, 
  Share2, 
  Heart, 
  Search,
  Globe
} from "lucide-react";

export interface PlatformInfo {
  name: string;
  color: string;
  bgColor: string;
  icon: typeof Play;
}

export const platformMap: Record<string, PlatformInfo> = {
  Instagram: {
    name: "Instagram",
    color: "text-pink-600",
    bgColor: "bg-pink-100",
    icon: Heart,
  },
  YouTube: {
    name: "YouTube",
    color: "text-red-600",
    bgColor: "bg-red-100",
    icon: Play,
  },
  TikTok: {
    name: "TikTok",
    color: "text-black",
    bgColor: "bg-gray-900",
    icon: Music,
  },
  "Twitter/X": {
    name: "Twitter/X",
    color: "text-gray-900",
    bgColor: "bg-gray-900",
    icon: Share2,
  },
  Facebook: {
    name: "Facebook",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    icon: MessageCircle,
  },
  Reddit: {
    name: "Reddit",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    icon: Search,
  },
  Vimeo: {
    name: "Vimeo",
    color: "text-blue-500",
    bgColor: "bg-blue-100",
    icon: Play,
  },
  Dailymotion: {
    name: "Dailymotion",
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    icon: Play,
  },
  Unknown: {
    name: "Unknown",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    icon: Globe,
  },
};

export function getPlatformInfo(platform: string): PlatformInfo {
  return platformMap[platform] || platformMap.Unknown;
}
