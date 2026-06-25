using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.QuickDownload
{
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            // Primary injection path: intercept index.html responses in the ASP.NET Core
            // middleware pipeline (no File Transformation dependency, no disk writes).
            serviceCollection.AddTransient<IStartupFilter, IndexHtmlInjectionFilter>();

            // Secondary path: also try File Transformation plugin registration + on-disk fallback.
            serviceCollection.AddHostedService<StartupTask>();
        }
    }
}
