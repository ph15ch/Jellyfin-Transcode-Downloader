using System;
using System.Collections.Generic;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.TranscodeDownloader
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        public static readonly Guid PluginId = new Guid("a4b5c6d7-e8f9-0a1b-2c3d-4e5f6a7b8c9d");

        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
        }

        /// <summary>
        /// The plugin as Jellyfin loaded it — how <see cref="TranscodeDownloaderController"/>
        /// reaches the administrator's settings. Null only before Jellyfin has constructed it.
        /// </summary>
        public static Plugin? Instance { get; private set; }

        public override string Name => "Transcode Downloader";

        public override Guid Id => PluginId;

        /// <summary>
        /// Registers the settings page served at
        /// <c>/web/ConfigurationPage?name=TranscodeDownloader</c>. The name is the URL key and is
        /// kept free of spaces; the dashboard lists the page under the plugin's own name.
        /// </summary>
        public IEnumerable<PluginPageInfo> GetPages() => new[]
        {
            new PluginPageInfo
            {
                Name = "TranscodeDownloader",
                EmbeddedResourcePath = "Jellyfin.Plugin.TranscodeDownloader.web.configPage.html",
            },
        };
    }
}
