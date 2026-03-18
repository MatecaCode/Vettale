import { useEffect, useRef } from 'react';

interface YouTubeEmbedProps {
  videoId: string;
  title: string;
  className?: string;
}

const PAUSE_EVENT = 'vettale:pauseAllVideos';

const YouTubeEmbed = ({ videoId, title, className = '' }: YouTubeEmbedProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const postCommand = (func: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      '*'
    );
  };

  useEffect(() => {
    const handlePause = (e: Event) => {
      const ce = e as CustomEvent<{ except: HTMLIFrameElement | null }>;
      if (ce.detail.except !== iframeRef.current) {
        postCommand('pauseVideo');
      }
    };

    window.addEventListener(PAUSE_EVENT, handlePause);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          window.dispatchEvent(
            new CustomEvent(PAUSE_EVENT, { detail: { except: iframeRef.current } })
          );
          postCommand('playVideo');
        } else {
          postCommand('pauseVideo');
        }
      },
      { threshold: 0.6 }
    );

    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      window.removeEventListener(PAUSE_EVENT, handlePause);
    };
  }, []);

  return (
    <div ref={containerRef} className={`rounded-lg shadow-lg overflow-hidden ${className}`}>
      <div className="aspect-video">
        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="w-full h-full"
        />
      </div>
    </div>
  );
};

export default YouTubeEmbed;
