namespace Jellyfin.Plugin.TranscodeDownloader
{
    /// <summary>
    /// Response of <c>GET /TranscodeDownloader/Config</c>: the administrator settings the client
    /// script needs, and nothing else. Jellyfin's own <c>/Plugins/{id}/Configuration</c> requires
    /// elevation, so an ordinary user cannot read the queue limit from it — and exposing the
    /// whole configuration object here would leak every setting added to it later.
    /// </summary>
    public class ClientConfigurationDto
    {
        /// <summary>Contract version. Bumped only on breaking changes.</summary>
        public int SchemaVersion { get; set; } = 1;

        /// <summary>
        /// How many queued downloads the client may run at the same time.
        /// See <see cref="PluginConfiguration.MaxConcurrentDownloads"/>.
        /// </summary>
        public int MaxConcurrentDownloads { get; set; } = PluginConfiguration.MinConcurrentDownloads;
    }
}
