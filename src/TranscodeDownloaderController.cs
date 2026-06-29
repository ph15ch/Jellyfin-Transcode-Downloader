using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TranscodeDownloader
{
    /// <summary>
    /// Serves the embedded Transcode Downloader client script and string bundles.
    /// All endpoints are anonymous — the browser loads them via plain script/fetch with no API token.
    /// </summary>
    [ApiController]
    [AllowAnonymous]
    [Route("TranscodeDownloader")]
    public class TranscodeDownloaderController : ControllerBase
    {
        private const string ResourcePrefix = "Jellyfin.Plugin.TranscodeDownloader.web.";

        private static readonly HashSet<string> SupportedLocales = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "en-us", "de", "fr", "es", "zh-cn", "nl"
        };

        /// <summary>
        /// GET /TranscodeDownloader/ClientScript — returns the embedded plugin.js.
        /// </summary>
        [HttpGet("ClientScript")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [Produces("application/javascript")]
        public ActionResult GetClientScript()
        {
            var stream = typeof(TranscodeDownloaderController).Assembly
                .GetManifestResourceStream(ResourcePrefix + "plugin.js");

            if (stream is null) return NotFound();

            return File(stream, "application/javascript");
        }

        /// <summary>
        /// GET /TranscodeDownloader/strings/{locale}.json — returns the translation bundle for the given locale.
        /// Supported locales: en-us, de, fr, es, zh-cn, nl.
        /// </summary>
        [HttpGet("strings/{locale}.json")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [Produces("application/json")]
        public ActionResult GetStrings(string locale)
        {
            if (!SupportedLocales.Contains(locale)) return NotFound();

            var stream = typeof(TranscodeDownloaderController).Assembly
                .GetManifestResourceStream(ResourcePrefix + "strings." + locale + ".json");

            if (stream is null) return NotFound();

            return File(stream, "application/json");
        }
    }
}
