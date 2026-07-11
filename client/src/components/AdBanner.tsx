import { useEffect, useRef } from "react";

interface AdBannerProps {
  slot: "top" | "middle" | "bottom";
}

const AD_SLOTS: Record<string, string> = {
  top: "1111111111",
  middle: "2222222222",
  bottom: "3333333333",
};

export default function AdBanner({ slot }: AdBannerProps) {
  const adRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    if (!adRef.current) return;

    try {
      const adsbygoogle = (window as any).adsbygoogle;
      if (adsbygoogle) {
        adsbygoogle.push({});
        pushed.current = true;
      }
    } catch {
      // AdSense not loaded yet
    }
  }, []);

  // Don't render if no AdSense publisher ID is configured
  const hasAdsense = typeof window !== "undefined" &&
    document.querySelector('script[src*="googlesyndication"]') !== null;

  if (!hasAdsense) {
    return (
      <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg p-4 text-center">
        <p className="text-xs text-slate-400 font-medium">Advertisement Space</p>
        <p className="text-[10px] text-slate-300 mt-1">Configure your AdSense ID in index.html</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", maxWidth: "728px", height: "90px" }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot={AD_SLOTS[slot]}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
