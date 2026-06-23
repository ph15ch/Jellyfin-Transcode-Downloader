using System;
using System.Collections.Generic;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.QuickDownload
{
    public class Plugin : BasePlugin, IHasWebPages, IPluginServiceRegistrator
    {
        public Plugin()
        {
        }

        /// <inheritdoc />
        public override string Name => "QuickDownload";

        /// <inheritdoc />
        public override Guid Id => new Guid("a4b5c6d7-e8f9-0a1b-2c3d-4e5f6a7b8c9d");

        public void RegisterServices(IServiceCollection serviceCollection, IConfiguration configuration)
        {
            serviceCollection.AddHostedService<PluginEntryPoint>();
        }

        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name = "quickdownload",
                    EmbeddedResourcePath = GetType().Namespace + ".web.config.json"
                }
            };
        }
    }
}
