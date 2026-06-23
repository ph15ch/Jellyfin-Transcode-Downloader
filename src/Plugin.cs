using System;
using System.Collections.Generic;
using System.IO;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.QuickDownload
{
    public class Plugin : BasePlugin, IHasWebPages
    {
        private const string Marker = "<!-- QuickDownload -->";
        private const string ScriptTag =
            "<script src=\"/web/quickdownload/plugin.js\" type=\"module\"></script>";

        public Plugin(IApplicationPaths appPaths, ILogger<Plugin> logger)
        {
            Inject(appPaths, logger);
        }

        /// <inheritdoc />
        public override string Name => "QuickDownload";

        /// <inheritdoc />
        public override Guid Id => new Guid("a4b5c6d7-e8f9-0a1b-2c3d-4e5f6a7b8c9d");

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

        private void Inject(IApplicationPaths appPaths, ILogger<Plugin> logger)
        {
            try
            {
                var webPath = appPaths.WebPath;

                var dir = Path.Combine(webPath, "quickdownload");
                Directory.CreateDirectory(dir);
                var destFile = Path.Combine(dir, "plugin.js");

                const string resourceName = "Jellyfin.Plugin.QuickDownload.web.plugin.js";
                using var src = GetType().Assembly.GetManifestResourceStream(resourceName)
                    ?? throw new InvalidOperationException($"Missing embedded resource: {resourceName}");
                using var dst = new FileStream(destFile, FileMode.Create, FileAccess.Write);
                src.CopyTo(dst);

                logger.LogInformation("[QuickDownload] Wrote plugin.js to {Path}", destFile);

                var indexPath = Path.Combine(webPath, "index.html");
                if (!File.Exists(indexPath))
                {
                    logger.LogWarning("[QuickDownload] index.html not found in {WebPath}", webPath);
                    return;
                }

                var html = File.ReadAllText(indexPath);

                if (html.Contains(Marker, StringComparison.Ordinal))
                {
                    logger.LogInformation("[QuickDownload] Already injected into index.html");
                    return;
                }

                if (!html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
                {
                    logger.LogWarning("[QuickDownload] No </body> in index.html — cannot inject script");
                    return;
                }

                var patched = html.Replace(
                    "</body>",
                    $"\n    {Marker}\n    {ScriptTag}\n</body>",
                    StringComparison.OrdinalIgnoreCase);

                File.WriteAllText(indexPath, patched);
                logger.LogInformation("[QuickDownload] Script tag injected into index.html");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "[QuickDownload] Failed to inject web assets");
            }
        }
    }
}
