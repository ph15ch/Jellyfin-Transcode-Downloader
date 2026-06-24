using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.QuickDownload
{
    public class StartupTask : IHostedService
    {
        private const string Marker = "<!-- QuickDownload -->";
        private static readonly string ScriptTag =
            $"<script src=\"/web/quickdownload/plugin.js?v={typeof(StartupTask).Assembly.GetName().Version}\" defer></script>";

        private readonly IApplicationPaths _appPaths;
        private readonly ILogger<StartupTask> _logger;

        public StartupTask(IApplicationPaths appPaths, ILogger<StartupTask> logger)
        {
            _appPaths = appPaths;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            InjectWebAssets();
            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        private void InjectWebAssets()
        {
            try
            {
                var webPath = _appPaths.WebPath;

                var dir = Path.Combine(webPath, "quickdownload");
                Directory.CreateDirectory(dir);
                var destFile = Path.Combine(dir, "plugin.js");

                const string resourceName = "Jellyfin.Plugin.QuickDownload.web.plugin.js";
                using var src = typeof(StartupTask).Assembly.GetManifestResourceStream(resourceName)
                    ?? throw new InvalidOperationException($"Missing embedded resource: {resourceName}");
                using var dst = new FileStream(destFile, FileMode.Create, FileAccess.Write);
                src.CopyTo(dst);

                _logger.LogInformation("[QuickDownload] Wrote plugin.js to {Path}", destFile);

                var indexPath = Path.Combine(webPath, "index.html");
                if (!File.Exists(indexPath))
                {
                    _logger.LogWarning("[QuickDownload] index.html not found in {WebPath}", webPath);
                    return;
                }

                var html = File.ReadAllText(indexPath);

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

                File.WriteAllText(indexPath, patched);
                _logger.LogInformation("[QuickDownload] Script tag injected into index.html");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[QuickDownload] Failed to inject web assets");
            }
        }
    }
}
