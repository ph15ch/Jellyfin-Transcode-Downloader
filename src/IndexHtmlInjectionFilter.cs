using System;
using System.IO;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.QuickDownload
{
    /// <summary>
    /// ASP.NET Core startup filter that intercepts every response for index.html
    /// and injects the QuickDownload script tag before &lt;/body&gt;. Works at the
    /// HTTP pipeline level — no disk writes, no File Transformation dependency.
    /// </summary>
    public class IndexHtmlInjectionFilter : IStartupFilter
    {
        private readonly IConfigurationManager _configManager;
        private readonly ILogger<IndexHtmlInjectionFilter> _logger;
        private bool _logged;

        public IndexHtmlInjectionFilter(
            IConfigurationManager configManager,
            ILogger<IndexHtmlInjectionFilter> logger)
        {
            _configManager = configManager;
            _logger = logger;
        }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                app.Use(InjectAsync);
                next(app);
            };
        }

        private async Task InjectAsync(HttpContext context, RequestDelegate next)
        {
            if (!IsIndexHtml(context.Request.Path))
            {
                await next(context);
                return;
            }

            var originalBody = context.Response.Body;

            // Disable zero-copy SendFile so the static file middleware writes through
            // Response.Body (our buffer) rather than bypassing it via the kernel path.
            var sendFile = context.Features.Get<IHttpSendFileFeature>();
            context.Features.Set<IHttpSendFileFeature>(null);

            await using var buffer = new MemoryStream();
            context.Response.Body = buffer;

            try
            {
                await next(context);
            }
            catch
            {
                context.Response.Body = originalBody;
                context.Features.Set(sendFile);
                buffer.Position = 0;
                await buffer.CopyToAsync(originalBody);
                throw;
            }

            context.Response.Body = originalBody;
            context.Features.Set(sendFile);
            buffer.Position = 0;

            if (context.Response.StatusCode == 200
                && context.Response.ContentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) == true)
            {
                using var reader = new StreamReader(buffer);
                var html = await reader.ReadToEndAsync();

                if (!html.Contains(WebAssetInjector.Marker, StringComparison.Ordinal)
                    && html.Contains("</body>", StringComparison.OrdinalIgnoreCase))
                {
                    var basePath = ResolveBasePath();
                    var tag = WebAssetInjector.BuildScriptTag(basePath);
                    html = html.Replace(
                        "</body>",
                        $"\n    {WebAssetInjector.Marker}\n    {tag}\n</body>",
                        StringComparison.OrdinalIgnoreCase);

                    if (!_logged)
                    {
                        _logger.LogInformation("[QuickDownload] Script tag injected into index.html (middleware).");
                        _logged = true;
                    }
                }

                // Clear length headers — body size changed after injection.
                context.Response.Headers.Remove("Content-Length");
                context.Response.Headers.Remove("ETag");
                context.Response.ContentLength = null;

                await context.Response.WriteAsync(html, context.RequestAborted);
            }
            else
            {
                await buffer.CopyToAsync(originalBody);
            }
        }

        private static bool IsIndexHtml(PathString path)
        {
            var v = path.Value ?? string.Empty;
            return v.EndsWith("/index.html", StringComparison.OrdinalIgnoreCase)
                || string.Equals(v, "/web/", StringComparison.OrdinalIgnoreCase)
                || string.Equals(v, "/web", StringComparison.OrdinalIgnoreCase);
        }

        private string ResolveBasePath()
        {
            try
            {
                var cfg = _configManager.GetConfiguration("network");
                var raw = cfg?.GetType().GetProperty("BaseUrl")?.GetValue(cfg) as string;
                if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
                var trimmed = raw.Trim().TrimEnd('/');
                return trimmed.StartsWith('/') ? trimmed : "/" + trimmed;
            }
            catch
            {
                return string.Empty;
            }
        }
    }
}
