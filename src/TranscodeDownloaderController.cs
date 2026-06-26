using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TranscodeDownloader
{
    /// <summary>
    /// Serves the embedded Transcode Downloader client script.
    /// The browser loads it via a plain <c>&lt;script&gt;</c> tag with no API token,
    /// so the endpoint MUST allow anonymous access.
    /// </summary>
    [ApiController]
    [AllowAnonymous]
    [Route("TranscodeDownloader")]
    public class TranscodeDownloaderController : ControllerBase
    {
        private const string ResourceName = "Jellyfin.Plugin.TranscodeDownloader.web.plugin.js";

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
                .GetManifestResourceStream(ResourceName);

            if (stream is null)
            {
                return NotFound();
            }

            return File(stream, "application/javascript");
        }
    }
}
