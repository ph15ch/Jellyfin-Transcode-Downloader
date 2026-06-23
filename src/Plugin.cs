using System;
using System.Collections.Generic;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.QuickDownload
{
    /// <summary>
    /// QuickDownload plugin — thin C# wrapper that serves the web/ assets.
    /// All real logic lives in plugin.js (JavaScript).
    /// </summary>
    public class Plugin : BasePlugin, IHasWebPages
    {
        public Plugin()
        {
        }

        /// <inheritdoc />
        public override string Name => "QuickDownload";

        /// <inheritdoc />
        public override Guid Id => new Guid("a4b5c6d7-e8f9-0a1b-2c3d-4e5f6a7b8c9d");

        /// <summary>
        /// Returns the web pages (static assets) this plugin contributes.
        /// Jellyfin will serve these from the plugin's web/ subdirectory.
        /// </summary>
        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name = "quickdownload",
                    EmbeddedResourcePath = GetType().Namespace + ".web.config.json"
                }
            };
        }
    }
}
