using System;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.QuickDownload
{
    /// <summary>
    /// On startup, injects the QuickDownload client-script tag into the Jellyfin web
    /// client. The script itself is served by <see cref="QuickDownloadController"/>;
    /// this task only ensures the &lt;script&gt; tag reaches index.html (via the File
    /// Transformation plugin, or an on-disk fallback). No plugin.js is copied to disk.
    /// </summary>
    public class StartupTask : IHostedService
    {
        private readonly IConfigurationManager _configManager;
        private readonly ILogger<StartupTask> _logger;

        public StartupTask(IConfigurationManager configManager, ILogger<StartupTask> logger)
        {
            _configManager = configManager;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            try
            {
                var appPaths = _configManager.CommonApplicationPaths;
                var webPath = appPaths.WebPath;
                var basePath = ResolveBasePath();

                WebAssetInjector.Inject(webPath, basePath, _logger);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[QuickDownload] Failed to inject web assets");
            }

            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        /// <summary>
        /// Reads the configured network base path (e.g. "/jellyfin") so the injected
        /// script src resolves when Jellyfin runs under a sub-path. Read via the generic
        /// configuration store to avoid a compile-time dependency on Jellyfin.Networking.
        /// Returns an empty string when no base path is configured.
        /// </summary>
        private string ResolveBasePath()
        {
            try
            {
                var networkConfig = _configManager.GetConfiguration("network");
                var baseUrl = networkConfig?.GetType()
                    .GetProperty("BaseUrl")?
                    .GetValue(networkConfig) as string;

                return baseUrl ?? string.Empty;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[QuickDownload] Could not read network base path; assuming none.");
                return string.Empty;
            }
        }
    }
}
