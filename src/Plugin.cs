using System;
using System.IO;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;

namespace Jellyfin.Plugin.TranscodeDownloader
{
    public class Plugin : BasePlugin
    {
        public static readonly Guid PluginId = new Guid("a4b5c6d7-e8f9-0a1b-2c3d-4e5f6a7b8c9d");

        public Plugin(IApplicationPaths applicationPaths)
        {
            var assembly = GetType().Assembly;
            var filePath = assembly.Location;
            SetAttributes(
                filePath,
                Path.Combine(applicationPaths.PluginsPath, Path.GetFileNameWithoutExtension(filePath)),
                assembly.GetName().Version);
        }

        public override string Name => "Transcode Downloader";

        public override Guid Id => PluginId;
    }
}
