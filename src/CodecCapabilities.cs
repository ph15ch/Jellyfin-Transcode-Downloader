using System.Collections.Generic;

namespace Jellyfin.Plugin.TranscodeDownloader
{
    /// <summary>
    /// Response of <c>GET /TranscodeDownloader/Codecs</c>. Deliberately small and stable so the
    /// client script can evolve independently of the server DLL; additive changes bump
    /// <see cref="SchemaVersion"/>.
    /// </summary>
    public class CodecCapabilitiesDto
    {
        /// <summary>Contract version. Bumped only on breaking changes.</summary>
        public int SchemaVersion { get; set; } = 1;

        /// <summary>Video codecs offered by the download UI, in display order.</summary>
        public IReadOnlyList<CodecCapabilityDto> VideoCodecs { get; set; } = new List<CodecCapabilityDto>();

        /// <summary>Audio codecs offered by the download UI, in display order.</summary>
        public IReadOnlyList<CodecCapabilityDto> AudioCodecs { get; set; } = new List<CodecCapabilityDto>();
    }

    /// <summary>
    /// One codec as the download UI sees it: what it would be encoded with, and whether that
    /// is actually going to work on this server.
    /// </summary>
    public class CodecCapabilityDto
    {
        /// <summary>
        /// The value sent as <c>VideoCodec</c>/<c>AudioCodec</c> on the stream URL
        /// (<c>h264</c>, <c>hevc</c>, <c>av1</c>, <c>aac</c>, <c>opus</c>).
        /// </summary>
        public string Codec { get; set; } = string.Empty;

        /// <summary>The FFmpeg encoder Jellyfin would resolve this codec to, e.g. <c>libsvtav1</c>.</summary>
        public string Encoder { get; set; } = string.Empty;

        /// <summary>True when <see cref="Encoder"/> is a hardware encoder.</summary>
        public bool IsHardware { get; set; }

        /// <summary>True when this server's FFmpeg actually has <see cref="Encoder"/>.</summary>
        public bool IsSupported { get; set; }

        /// <summary>
        /// False when the administrator turned the codec off in Dashboard → Playback
        /// (<c>AllowAv1Encoding</c> / <c>AllowHevcEncoding</c>). Always true for codecs with
        /// no such toggle.
        /// </summary>
        public bool IsAllowedByAdmin { get; set; }
    }
}
