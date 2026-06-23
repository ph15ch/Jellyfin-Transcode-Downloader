using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.QuickDownload
{
    public class PluginEntryPoint : IHostedService
    {
        private const string Marker = "<!-- QuickDownload -->";
        private const string ScriptTag =
            "<script src=\"/web/quickdownload/plugin.js\" type=\"module\"></script>";

        private readonly IApplicationPaths _appPaths;
        private readonly ILogger<PluginEntryPoint> _logger;

        public PluginEntryPoint(IApplicationPaths appPaths, ILogger<PluginEntryPoint> logger)
        {
            _appPaths = appPaths;
            _logger = logger;
        }

        public async Task StartAsync(CancellationToken cancellationToken)
        {
            try
            {
                await InjectAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[QuickDownload] Failed to inject web assets");
            }
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        private async Task InjectAsync()
        {
            var webPath = _appPaths.WebPath;

            // Write plugin.js into <webroot>/quickdownload/ so nginx can serve it
            var dir = Path.Combine(webPath, "quickdownload");
            Directory.CreateDirectory(dir);
            var destFile = Path.Combine(dir, "plugin.js");

            const string resourceName = "Jellyfin.Plugin.QuickDownload.web.plugin.js";
            await using var src = GetType().Assembly.GetManifestResourceStream(resourceName)
                ?? throw new InvalidOperationException($"Missing embedded resource: {resourceName}");
            await using var dst = new FileStream(destFile, FileMode.Create, FileAccess.Write);
            await src.CopyToAsync(dst).ConfigureAwait(false);

            _logger.LogInformation("[QuickDownload] Wrote plugin.js to {Path}", destFile);

            // Inject a <script> tag into index.html (idempotent — guarded by Marker)
            var indexPath = Path.Combine(webPath, "index.html");
            if (!File.Exists(indexPath))
            {
                _logger.LogWarning("[QuickDownload] index.html not found in {WebPath}", webPath);
                return;
            }

            var html = await File.ReadAllTextAsync(indexPath).ConfigureAwait(false);

            if (html.Contains(Marker, StringComparison.Ordinal))
            {
                _logger.LogInformation("[QuickDownload] Already injected into index.html");
                return;
            }

            if (!html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("[QuickDownload] No </body> in index.html — cannot inject script");
                return;
            }

            var patched = html.Replace(
                "</body>",
                $"\n    {Marker}\n    {ScriptTag}\n</body>",
                StringComparison.OrdinalIgnoreCase);

            await File.WriteAllTextAsync(indexPath, patched).ConfigureAwait(false);
            _logger.LogInformation("[QuickDownload] Script tag injected into index.html");
        }
    }
}
