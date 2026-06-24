using System;
using MediaBrowser.Common.Plugins;

namespace Jellyfin.Plugin.QuickDownload
{
    public class Plugin : BasePlugin
    {
        public override string Name => "QuickDownload";
        public override Guid Id => new Guid("a4b5c6d7-e8f9-0a1b-2c3d-4e5f6a7b8c9d");
    }
}
