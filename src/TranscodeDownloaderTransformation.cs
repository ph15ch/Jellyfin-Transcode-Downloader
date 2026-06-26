using System;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.TranscodeDownloader
{
    /// <summary>
    /// Payload handed to the File Transformation callback. The File Transformation
    /// plugin serializes the current file contents into an object and invokes our
    /// callback (located by assembly/class/method name via reflection), then takes
    /// the returned string as the new contents.
    /// </summary>
    public class PatchRequestPayload
    {
        [JsonPropertyName("contents")]
        public string? Contents { get; set; }
    }

    /// <summary>
    /// In-memory index.html transformation registered with the File Transformation
    /// plugin. Inserts the Transcode Downloader client-script tag just before
    /// <c>&lt;/body&gt;</c>. No disk writes occur — File Transformation rewrites the
    /// HTML as it is served.
    /// </summary>
    public static class TranscodeDownloaderTransformation
    {
        /// <summary>
        /// Callback invoked by the File Transformation plugin for index.html.
        /// Must be public, static, take the payload, and return the new contents.
        /// </summary>
        public static string IndexHtml(PatchRequestPayload payload)
        {
            var contents = payload?.Contents;
            if (string.IsNullOrEmpty(contents))
            {
                return contents ?? string.Empty;
            }

            // Idempotent: never inject twice.
            if (contents.Contains(WebAssetInjector.Marker, StringComparison.Ordinal))
            {
                return contents;
            }

            if (!contents.Contains("</body>", StringComparison.OrdinalIgnoreCase))
            {
                return contents;
            }

            var block = "\n    " + WebAssetInjector.Marker + "\n    " + WebAssetInjector.BuildScriptTag() + "\n</body>";
            return contents.Replace("</body>", block, StringComparison.OrdinalIgnoreCase);
        }
    }
}
