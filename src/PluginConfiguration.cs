using System;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.TranscodeDownloader
{
    /// <summary>
    /// Administrator settings, edited in Dashboard → Plugins → Transcode Downloader and
    /// persisted next to the plugin as XML.
    /// </summary>
    public class PluginConfiguration : BasePluginConfiguration
    {
        /// <summary>A strictly sequential queue: one download, and therefore one transcode, at a time.</summary>
        public const int MinConcurrentDownloads = 1;

        /// <summary>
        /// Ceiling on <see cref="MaxConcurrentDownloads"/>. Browsers allow six connections per
        /// origin on HTTP/1.1, so a higher limit would leave the web client's own requests
        /// queued behind the downloads instead of adding throughput.
        /// </summary>
        public const int MaxAllowedConcurrentDownloads = 5;

        private int _maxConcurrentDownloads = MinConcurrentDownloads;

        /// <summary>
        /// How many queued downloads may run at the same time. Each one is a transcode the
        /// server runs on the fly, so this is equally a cap on concurrent transcodes started
        /// from the plugin. Defaults to one — concurrency is opt-in because it multiplies both
        /// the FFmpeg load on the server and the memory the browser holds.
        /// Clamped on assignment so a hand-edited configuration file cannot push it out of range.
        /// </summary>
        public int MaxConcurrentDownloads
        {
            get => _maxConcurrentDownloads;
            set => _maxConcurrentDownloads = Math.Clamp(value, MinConcurrentDownloads, MaxAllowedConcurrentDownloads);
        }
    }
}
