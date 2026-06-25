using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.QuickDownload
{
    /// <summary>
    /// Delivers the QuickDownload client script tag into the Jellyfin web client.
    ///
    /// Primary path (no disk writes): reflectively register an in-memory index.html
    /// transformation with the File Transformation plugin, which rewrites the HTML
    /// as it is served. Fallback (writable installs only): patch index.html on disk.
    ///
    /// The JS itself is always served by <see cref="QuickDownloadController"/>; this
    /// class only injects the &lt;script&gt; tag that loads it.
    /// </summary>
    public static class WebAssetInjector
    {
        public const string Marker = "<!-- QuickDownload -->";

        // The configured base path (e.g. "/jellyfin"), normalized to "" or "/seg".
        // Set once at startup so the transformation callback (which runs later, per
        // request) builds the correct absolute src.
        private static string _basePath = string.Empty;

        /// <summary>
        /// Builds the script tag, accounting for any configured base path so the
        /// src resolves correctly when Jellyfin runs under a sub-path.
        /// </summary>
        public static string BuildScriptTag()
        {
            var version = typeof(WebAssetInjector).Assembly.GetName().Version?.ToString() ?? "0";
            return $"<script src=\"{_basePath}/QuickDownload/ClientScript?v={version}\" defer></script>";
        }

        /// <summary>
        /// Inject the client-script tag. Tries File Transformation first; if it is
        /// not present, falls back to a best-effort on-disk index.html patch.
        /// </summary>
        public static void Inject(string webPath, string basePath, ILogger logger)
        {
            _basePath = NormalizeBasePath(basePath);

            if (TryRegisterFileTransformation(logger))
            {
                logger.LogInformation(
                    "[QuickDownload] Registered index.html transformation with the File Transformation plugin (in-memory, no disk writes).");
                return;
            }

            logger.LogWarning(
                "[QuickDownload] File Transformation plugin not found. Falling back to on-disk index.html patch. "
                + "For permission-safe injection that survives Jellyfin web updates, install the File Transformation plugin (>= v2.2.1.0).");

            TryOnDiskFallback(webPath, logger);
        }

        private static string NormalizeBasePath(string? basePath)
        {
            if (string.IsNullOrWhiteSpace(basePath))
            {
                return string.Empty;
            }

            var trimmed = basePath.Trim().TrimEnd('/');
            if (trimmed.Length == 0)
            {
                return string.Empty;
            }

            return trimmed.StartsWith('/') ? trimmed : "/" + trimmed;
        }

        /// <summary>
        /// Reflectively locate the File Transformation plugin and register our
        /// index.html transformation. Takes no compile-time dependency on it.
        /// Returns true on success.
        /// </summary>
        private static bool TryRegisterFileTransformation(ILogger logger)
        {
            try
            {
                var assembly = AssemblyLoadContext.All
                    .SelectMany(ctx => ctx.Assemblies)
                    .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) ?? false);

                if (assembly is null)
                {
                    return false;
                }

                var pluginInterface = assembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
                if (pluginInterface is null)
                {
                    logger.LogWarning(
                        "[QuickDownload] File Transformation assembly found but PluginInterface type was missing; using fallback.");
                    return false;
                }

                var register = pluginInterface.GetMethod("RegisterTransformation");
                if (register is null)
                {
                    logger.LogWarning(
                        "[QuickDownload] File Transformation PluginInterface has no RegisterTransformation method; using fallback.");
                    return false;
                }

                var payload = new JObject
                {
                    { "id", Plugin.PluginId.ToString() },
                    { "fileNamePattern", "index.html" },
                    { "callbackAssembly", typeof(WebAssetInjector).Assembly.FullName },
                    { "callbackClass", typeof(QuickDownloadTransformation).FullName },
                    { "callbackMethod", nameof(QuickDownloadTransformation.IndexHtml) }
                };

                register.Invoke(null, new object?[] { payload });
                return true;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "[QuickDownload] Failed to register with the File Transformation plugin; using fallback.");
                return false;
            }
        }

        private static void TryOnDiskFallback(string webPath, ILogger logger)
        {
            try
            {
                var indexPath = Path.Combine(webPath, "index.html");
                if (!File.Exists(indexPath))
                {
                    logger.LogWarning("[QuickDownload] index.html not found in {WebPath}", webPath);
                    return;
                }

                var html = File.ReadAllText(indexPath);

                if (html.Contains(Marker, StringComparison.Ordinal))
                {
                    logger.LogInformation("[QuickDownload] Script tag already present in index.html");
                    return;
                }

                if (!html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
                {
                    logger.LogWarning("[QuickDownload] No </body> in index.html — cannot inject script");
                    return;
                }

                var patched = html.Replace(
                    "</body>",
                    $"\n    {Marker}\n    {BuildScriptTag()}\n</body>",
                    StringComparison.OrdinalIgnoreCase);

                File.WriteAllText(indexPath, patched);
                logger.LogInformation("[QuickDownload] Script tag injected into index.html (on-disk fallback)");
            }
            catch (UnauthorizedAccessException ex)
            {
                logger.LogError(ex,
                    "[QuickDownload] Cannot write index.html: the Jellyfin web directory ({WebPath}) is read-only for the service user. "
                    + "Install the File Transformation plugin (>= v2.2.1.0) so QuickDownload can inject its script in memory without filesystem writes. "
                    + "The download button will NOT appear until one of these is resolved.",
                    webPath);
            }
            catch (Exception ex)
            {
                logger.LogError(ex,
                    "[QuickDownload] Failed to patch index.html on disk. Install the File Transformation plugin (>= v2.2.1.0) "
                    + "to inject without filesystem writes. The download button will NOT appear until this is resolved.");
            }
        }
    }
}
